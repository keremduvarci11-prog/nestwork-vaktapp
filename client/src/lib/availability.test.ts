import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { readFileSync } from "node:fs";
import { apiRequest, getQueryFn } from "./queryClient";
import { availabilityMonthQueryKey, canEditAvailability, nextAvailabilityStatus, saveAvailability } from "./availability";

const originalFetch = globalThis.fetch;
const originalStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalStorage) Object.defineProperty(globalThis, "localStorage", originalStorage);
  else Reflect.deleteProperty(globalThis, "localStorage");
});

function bearerOnlySession() {
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: { getItem: (key: string) => key === "nestwork_token" ? "test-session" : null },
  });
  const requests: Array<{ url: string; options?: RequestInit }> = [];
  globalThis.fetch = async (input, options) => {
    requests.push({ url: String(input), options });
    // No cookie is provided: authorization is exclusively via the bearer token.
    assert.equal(new Headers(options?.headers).get("Authorization"), "Bearer test-session");
    assert.equal(options?.credentials, "include");
    return new Response("[]", { status: 200, headers: { "Content-Type": "application/json" } });
  };
  return requests;
}

test("custom protected GETs and the default query function authenticate without cookies", async () => {
  const requests = bearerOnlySession();
  const urls = [
    "/api/availability/me?month=2026-08",
    "/api/blocked-dates?month=2026-08",
    "/api/vakter/mine/employee-1",
    "/api/admin/availability/user/employee-1?month=2026-08",
  ];
  for (const url of urls) assert.deepEqual(await (await apiRequest("GET", url)).json(), []);
  const queryFn = getQueryFn({ on401: "throw" });
  assert.deepEqual(await queryFn({ queryKey: ["/api/vakter/mine", "employee-1"] } as Parameters<typeof queryFn>[0]), []);
  assert.deepEqual(requests.slice(0, 4).map((r) => r.url), urls);
});

test("availability cycle uses authenticated PUT, PUT, DELETE and invalidates the edited month", async () => {
  const requests = bearerOnlySession();
  const date = "2026-08-17";
  let status = nextAvailabilityStatus();
  assert.equal(status, "available");
  await saveAvailability({ date, status });
  status = nextAvailabilityStatus(status);
  assert.equal(status, "unavailable");
  await saveAvailability({ date, status });
  status = nextAvailabilityStatus(status);
  assert.equal(status, undefined);
  await saveAvailability({ date, status });
  assert.deepEqual(requests.map((r) => r.options?.method), ["PUT", "PUT", "DELETE"]);
  assert.deepEqual(JSON.parse(requests[0].options!.body as string), { date, status: "available" });
  assert.deepEqual(JSON.parse(requests[1].options!.body as string), { date, status: "unavailable" });
  assert.equal(requests[2].url, `/api/availability/me/${date}`);
  assert.equal(requests[2].options?.body, undefined);
  // Derived from mutation variables, never the currently navigated month.
  assert.deepEqual(availabilityMonthQueryKey(date), ["/api/availability/me", "2026-08"]);
});

test("unknown data, pending writes and all existing date restrictions prevent editing", () => {
  const editable = { ready: true, busy: false, isPast: false, isWeekend: false, isBlocked: false, hasShift: false };
  assert.equal(canEditAvailability(editable), true);
  assert.equal(canEditAvailability({ ...editable, ready: false }), false);
  for (const flag of ["busy", "isPast", "isWeekend", "isBlocked", "hasShift"]) {
    assert.equal(canEditAvailability({ ...editable, [flag]: true }), false, flag);
  }
});

test("read and write failures retain the original HTTP error detail", async () => {
  bearerOnlySession();
  globalThis.fetch = async () => new Response('{"message":"Dagen er blokkert"}', { status: 409 });
  await assert.rejects(apiRequest("GET", "/api/blocked-dates?month=2026-08"), /409: .*Dagen er blokkert/);
  await assert.rejects(saveAvailability({ date: "2026-08-17", status: "available" }), /409: .*Dagen er blokkert/);
});

test("availability calendar custom reads do not regress to cookie-only fetch", () => {
  const employee = readFileSync(new URL("../pages/employee/min-tilgjengelighet.tsx", import.meta.url), "utf8");
  const admin = readFileSync(new URL("../pages/admin/ansattes-onboarding.tsx", import.meta.url), "utf8");
  assert.equal(/\bfetch\(/.test(employee), false);
  for (const endpoint of ["/api/availability/me?month=", "/api/blocked-dates?month=", "/api/vakter/mine/"]) {
    assert.ok(employee.includes('apiRequest("GET", `' + endpoint));
  }
  assert.ok(admin.includes('apiRequest("GET", `/api/admin/availability/user/'));
  assert.ok(employee.includes("availabilityMonthQueryKey(date)"));
});