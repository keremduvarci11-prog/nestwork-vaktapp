import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { build, transform } from "esbuild";

async function pushHarness(platform = "ios") {
  const listeners = new Map<string, Set<Function>>();
  const calls: Array<{ url: string; body: any }> = [];
  const navigations: string[] = [];
  let permission = "granted";
  let fail = false;
  let nativeError = false;
  let registrations = 0;
  let webUnsubscribes = 0;
  const local = new Map();
  const webSubscription = {
    endpoint: "https://push.example/synthetic",
    toJSON: () => ({
      endpoint: "https://push.example/synthetic",
      keys: { p256dh: "a".repeat(87), auth: "b".repeat(22) },
    }),
    unsubscribe: async () => { webUnsubscribes++; return true; },
  };
  const webRegistration = { pushManager: { getSubscription: async () => webSubscription } };
  const context = vm.createContext({
    setTimeout, clearTimeout, console, URL,
    window: {
      Capacitor: { getPlatform: () => platform }, PushManager: {},
      location: { href: "capacitor://localhost/", assign: (path: string) => navigations.push(path) },
    },
    navigator: { serviceWorker: {
      register: async () => webRegistration,
      ready: Promise.resolve(webRegistration),
      getRegistration: async () => webRegistration,
    } },
    Notification: { get permission() { return permission; }, requestPermission: async () => permission },
    localStorage: {
      getItem: (key: string) => local.get(key) || null,
      setItem: (key: string, value: string) => local.set(key, value),
      removeItem: (key: string) => local.delete(key),
    },
    mocks: {
      apiRequest: async (_method: string, url: string, body: any) => {
        calls.push({ url, body });
        if (fail) throw new Error("synthetic failure");
      },
      queryClient: { invalidateQueries: async () => {} },
      PushNotifications: {
        checkPermissions: async () => ({ receive: permission }),
        requestPermissions: async () => ({ receive: permission }),
        addListener: async (name: string, cb: Function) => {
          const set = listeners.get(name) || new Set();
          listeners.set(name, set);
          set.add(cb);
          return { remove: async () => { set.delete(cb); } };
        },
        register: async () => {
          registrations++;
          for (const cb of listeners.get(nativeError ? "registrationError" : "registration") || []) {
            cb({ value: "a".repeat(64) });
          }
        },
      },
    },
  });
  const bundle = await build({
    entryPoints: ["client/src/lib/push.ts"], bundle: true, write: false,
    format: "iife", globalName: "push",
    plugins: [{
      name: "network-free-push",
      setup(builder) {
        builder.onResolve({ filter: /^(\.\/queryClient|@capacitor\/push-notifications)$/ }, args =>
          ({ path: args.path, namespace: "mock" }));
        builder.onLoad({ filter: /.*/, namespace: "mock" }, () => ({
          contents: "export const {apiRequest,queryClient,PushNotifications} = globalThis.mocks;",
        }));
      },
    }],
  });
  vm.runInContext(bundle.outputFiles[0].text, context);
  return {
    push: context.push, calls, local, listeners, navigations,
    registrations: () => registrations,
    webUnsubscribes: () => webUnsubscribes,
    permission: (value: string) => { permission = value; },
    fail: (value: boolean) => { fail = value; },
    nativeError: (value: boolean) => { nativeError = value; },
  };
}

test("native registration is per account, coalesced and retryable after denial and errors", async () => {
  const h = await pushHarness();
  h.push.setPushUser("account-a");
  h.permission("denied");
  await h.push.initPush();
  assert.equal(h.registrations(), 0);
  h.permission("granted");
  h.nativeError(true);
  await assert.rejects(h.push.initPush());
  h.nativeError(false);
  h.fail(true);
  await assert.rejects(h.push.initPush());
  h.fail(false);
  await Promise.all([h.push.initPush(), h.push.subscribeToPush()]);
  await h.push.initPush();
  assert.equal(h.registrations(), 3);
  assert.equal(h.calls.filter(c => c.url.endsWith("/subscribe")).length, 2);
  await h.push.cleanupPush();
  assert.equal(h.calls.at(-1)?.url, "/api/push/unsubscribe");
  assert.equal(h.local.size, 0);
  h.push.setPushUser(null);
  await h.push.initPush();
  assert.equal(h.registrations(), 3);
  h.push.setPushUser("account-b");
  await h.push.initPush();
  assert.equal(h.registrations(), 4);
  h.fail(true);
  await assert.rejects(h.push.cleanupPush(), /logge ut igjen/);
  assert.equal(h.local.size, 1, "failed detach remains available for retry");
  h.fail(false);
  await h.push.cleanupPush();
  h.push.setPushUser(null);
  h.push.setPushUser("account-b");
  await h.push.initPush();
  assert.equal(h.registrations(), 5, "same-account login must re-register");
});

test("native taps navigate only safe local paths with one listener across account changes", async () => {
  const h = await pushHarness();
  const tap = (url: unknown) => {
    for (const callback of h.listeners.get("pushNotificationActionPerformed") || []) {
      callback({ notification: { data: { url } } });
    }
  };
  h.push.setPushUser("account-a");
  await Promise.all([h.push.initPush(), h.push.initPush()]);
  assert.equal(h.listeners.get("pushNotificationActionPerformed")?.size, 1);
  tap("/mine-vakter?tab=active#vakt");
  tap("capacitor://localhost/varsler");
  for (const unsafe of ["https://evil.example", "//evil.example", "javascript:alert(1)",
    "capacitor://evil.example/varsler", "capacitor://localhost//evil.example",
    "/\\evil.example", "http://[invalid", { url: "/varsler" }]) tap(unsafe);
  assert.deepEqual(h.navigations, ["/mine-vakter?tab=active#vakt", "/varsler"]);
  await h.push.cleanupPush();
  h.push.setPushUser(null);
  tap("/ignored-while-logged-out");
  h.push.setPushUser("account-b");
  await h.push.initPush();
  assert.equal(h.listeners.get("pushNotificationActionPerformed")?.size, 1);
  assert.equal(h.listeners.get("pushNotificationReceived")?.size, 1);
  tap("/profil");
  assert.deepEqual(h.navigations, ["/mine-vakter?tab=active#vakt", "/varsler", "/profil"]);
});

test("profile logout failure is caught by mutation and surfaced as a retryable toast", async () => {
  const source = await readFile("client/src/pages/employee/profil.tsx", "utf8");
  const snippet = source.slice(source.indexOf("  const logoutMutation"), source.indexOf("  const toggleAvailability"));
  let options: any;
  const toasts: any[] = [];
  vm.runInNewContext((await transform(snippet, { loader: "ts" })).code, {
    useMutation: (value: unknown) => { options = value; },
    logout: async () => { throw new Error("Detachment failed; retry logout"); },
    toast: (value: unknown) => toasts.push(value),
  });
  await options.mutationFn().catch(options.onError);
  assert.equal(toasts[0].variant, "destructive");
  assert.equal(toasts[0].description, "Detachment failed; retry logout");
  assert.match(source, /onClick=\{\(\) => logoutMutation\.mutate\(\)\}/);
  assert.match(source, /disabled=\{logoutMutation\.isPending\}/);
  assert.match(source, /logoutMutation\.isPending \? "Logger ut…"/);
});

test("web subscriptions retry failed saves, detach on logout and rebind on another login", async () => {
  const h = await pushHarness("web");
  h.push.setPushUser("account-a");
  h.fail(true);
  await assert.rejects(h.push.initPush());
  h.fail(false);
  await h.push.initPush();
  await h.push.subscribeToPush();
  assert.equal(h.calls.length, 2);
  await h.push.cleanupPush();
  assert.equal(h.calls.at(-1)?.url, "/api/push/unsubscribe");
  assert.equal(h.webUnsubscribes(), 1);
  h.push.setPushUser("account-b");
  await h.push.initPush();
  assert.equal(h.calls.at(-1)?.url, "/api/push/subscribe");
  assert.equal(h.calls.length, 4);
});

test("account switch while native permission is pending cannot save a stale account", async () => {
  const h = await pushHarness();
  h.push.setPushUser("account-a");
  const pending = h.push.initPush();
  const cleanup = h.push.cleanupPush();
  await Promise.all([pending, cleanup]);
  assert.equal(h.calls.length, 0);
  h.push.setPushUser("account-b");
  await h.push.initPush();
  assert.equal(h.calls.length, 1);
});

// Execute only the real push route declarations with mocked Express/storage;
// no application boot, database import, listening socket or credentials.
test("push routes validate malformed input and scope unsubscribe to authenticated owner", async () => {
  const source = await readFile("server/routes.ts", "utf8");
  const snippet = source.slice(source.indexOf("  const validPushEndpoint"), source.indexOf("  // ===== Tilgjengelighet"));
  const routes = new Map<string, Function>();
  const removed: unknown[][] = [];
  const saved: any[] = [];
  const { code } = await transform(snippet, { loader: "ts" });
  vm.runInNewContext(code, {
    URL,
    app: { post: (url: string, _auth: unknown, handler: Function) => routes.set(url, handler) },
    requireAuth: () => {},
    getUserIdFromRequest: () => "owner-a",
    storage: {
      savePushSubscription: async (sub: unknown) => { saved.push(sub); },
      deletePushSubscription: async (...args: unknown[]) => { removed.push(args); },
    },
  });
  const request = async (path: string, body: unknown) => {
    let status = 200;
    const res = { status: (value: number) => { status = value; return res; }, json: () => {} };
    await routes.get(`/api/push/${path}`)!({ body }, res);
    return status;
  };
  for (const body of [null, {}, { endpoint: {} }, { endpoint: "apns://bad", keys: {} },
    { endpoint: "https://push.example/test", keys: [] },
    { endpoint: "https://push.example/test", keys: { p256dh: 12, auth: {} } }]) {
    assert.equal(await request("subscribe", body), 400);
  }
  const endpoint = `apns://${"a".repeat(64)}`;
  assert.equal(await request("subscribe", { endpoint, keys: { deviceToken: "a".repeat(64) } }), 200);
  assert.equal(saved[0].userId, "owner-a");
  assert.equal(await request("subscribe", {
    endpoint: "https://push.example/synthetic",
    keys: { p256dh: "a".repeat(87), auth: "b".repeat(22) },
  }), 200);
  assert.equal(await request("unsubscribe", { endpoint: 42 }), 400);
  assert.equal(await request("unsubscribe", { endpoint }), 200);
  assert.deepEqual(removed, [[endpoint, "owner-a"]]);
});

test("storage deletes only the requested owner/device and registration is transactional", async () => {
  const source = await readFile("server/storage.ts", "utf8");
  const methods = source.slice(source.indexOf("  async savePushSubscription"), source.indexOf("  async getUsersByRegion"));
  const rows = [
    { endpoint: "device-1", userId: "owner-a" },
    { endpoint: "device-2", userId: "owner-a" },
    { endpoint: "device-3", userId: "owner-b" },
  ];
  let transactions = 0;
  let locks = 0;
  const db: any = {
    delete: () => ({ where: async (predicate: Function) => {
      for (let i = rows.length - 1; i >= 0; i--) if (predicate(rows[i])) rows.splice(i, 1);
    } }),
    insert: () => ({ values: (value: any) => ({ returning: async () => { rows.push(value); return [value]; } }) }),
    execute: async () => { locks++; },
    transaction: async (callback: Function) => { transactions++; return callback(db); },
  };
  const context = vm.createContext({
    db, pushSubscriptions: { endpoint: "endpoint", userId: "userId" },
    eq: (key: string, value: string) => (row: any) => row[key] === value,
    and: (...predicates: Function[]) => (row: any) => predicates.every(p => p(row)),
    sql: () => {},
  });
  vm.runInContext((await transform(`class Storage {${methods}}\nglobalThis.storage = new Storage();`, { loader: "ts" })).code, context);
  await context.storage.deletePushSubscription("device-1", "owner-b");
  assert.equal(rows.length, 3);
  await context.storage.savePushSubscription({ endpoint: "device-1", userId: "owner-b" });
  await context.storage.savePushSubscription({ endpoint: "device-1", userId: "owner-b" });
  await context.storage.deletePushSubscription("device-1", "owner-a");
  assert.equal(rows.length, 3);
  assert.equal(transactions, 2);
  assert.equal(locks, 2);
  await context.storage.deletePushSubscription("device-1", "owner-b");
  assert.deepEqual(rows.map(r => r.endpoint), ["device-2", "device-3"]);
});

test("service worker handles invalid JSON, null and wrong-shaped payloads safely", async () => {
  const handlers = new Map<string, Function>();
  const notifications: any[] = [];
  const origin = "https://app.example";
  vm.runInNewContext(await readFile("client/public/sw.js", "utf8"), {
    URL, Date,
    self: {
      location: { origin },
      addEventListener: (name: string, handler: Function) => handlers.set(name, handler),
      registration: { showNotification: async (title: string, options: any) => notifications.push({ title, options }) },
    },
  });
  for (const payload of [null, [], { title: {}, body: 5, url: "https://evil.example" }, "broken"]) {
    let done;
    handlers.get("push")!({
      data: { json: () => { if (payload === "broken") throw new Error("invalid JSON"); return payload; } },
      waitUntil: (promise: Promise<unknown>) => { done = promise; },
    });
    await done;
  }
  assert.equal(notifications.length, 4);
  for (const notice of notifications) {
    assert.equal(notice.title, "Nestwork");
    assert.equal(notice.options.body, "");
    assert.equal(notice.options.data.url, `${origin}/`);
  }
});