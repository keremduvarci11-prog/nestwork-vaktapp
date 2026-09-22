import { apiRequest, queryClient } from "./queryClient";

const ENDPOINT_KEY = "nestwork_push_endpoint";
let userId: string | null = null;
let generation = 0;
let registeredUser: string | null = null;
let pending: Promise<void> | null = null;
let stopping = false;

// Auth calls this before rendering the signed-in application.
export function setPushUser(id: string | null) {
  if (userId !== id) {
    generation++;
    registeredUser = null;
    userId = id;
  }
}

function getPlatform(): string {
  return (window as any).Capacitor?.getPlatform?.() || "web";
}

export function initPush() {
  return registerPush(false);
}

export function subscribeToPush() {
  return registerPush(true);
}

async function registerPush(requestPermission: boolean): Promise<void> {
  if (!userId || stopping || registeredUser === userId) return;
  if (pending) {
    await pending;
    // A changed account must not inherit the preceding registration.
    if (userId && registeredUser !== userId) return registerPush(requestPermission);
    return;
  }
  const owner = userId;
  const epoch = generation;
  const current = () => generation === epoch && userId === owner && !stopping;
  const save = async (endpoint: string, keys: Record<string, string>) => {
    // Remember even an ambiguous network failure so logout can detach it.
    localStorage.setItem(ENDPOINT_KEY, endpoint);
    if (!current()) return;
    await apiRequest("POST", "/api/push/subscribe", { endpoint, keys });
    if (current()) registeredUser = owner;
  };
  const operation = async () => {
    if (getPlatform() === "android") return; // FCM is not configured.
    if (getPlatform() === "ios") {
      const { PushNotifications } = await import("@capacitor/push-notifications");
      await installNativeListeners();
      let permission = await PushNotifications.checkPermissions();
      if (permission.receive !== "granted") permission = await PushNotifications.requestPermissions();
      if (!current() || permission.receive !== "granted") return;
      const handles: Array<{ remove: () => Promise<void> }> = [];
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const token = await new Promise<string>((resolve, reject) => {
          timer = setTimeout(() => reject(new Error("Push-registrering tok for lang tid. Prøv igjen.")), 15000);
          void (async () => {
            handles.push(await PushNotifications.addListener("registration", token => resolve(token.value)));
            handles.push(await PushNotifications.addListener("registrationError", () =>
              reject(new Error("Kunne ikke registrere push-varsler. Prøv igjen."))));
            await PushNotifications.register();
          })().catch(reject);
        });
        if (!token) throw new Error("Push-registrering mangler enhetstoken.");
        await save(`apns://${token}`, { deviceToken: token });
      } finally {
        clearTimeout(timer);
        await Promise.all(handles.map(handle => handle.remove()));
      }
      return;
    }
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
    const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
    await navigator.serviceWorker.ready;
    const permission = requestPermission ? await Notification.requestPermission() : Notification.permission;
    if (!current() || permission !== "granted") return;
    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      const response = await apiRequest("GET", "/api/push/vapid-key");
      const { key } = await response.json();
      if (typeof key !== "string" || !key) throw new Error("Web push er ikke konfigurert.");
      if (!current()) return;
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(key),
      });
    }
    const json = subscription.toJSON();
    if (!json.endpoint || !json.keys) throw new Error("Ugyldig push-abonnement.");
    await save(json.endpoint, json.keys);
  };
  pending = operation();
  try {
    await pending;
  } finally {
    pending = null; // Denials, native errors and HTTP failures are always retryable.
  }
}

let foregroundListener: Promise<unknown> | null = null;
let actionListener: Promise<unknown> | null = null;
async function installNativeListeners() {
  if (!foregroundListener) {
    foregroundListener = import("@capacitor/push-notifications").then(({ PushNotifications }) =>
      PushNotifications.addListener("pushNotificationReceived", () => {
        if (!userId || stopping) return;
        void queryClient.invalidateQueries({ queryKey: ["/api/varsler"] });
        void queryClient.invalidateQueries({ queryKey: ["/api/varsler/unread-count"] });
      })).catch(error => {
        foregroundListener = null;
        throw error;
      });
  }
  if (!actionListener) {
    actionListener = import("@capacitor/push-notifications").then(({ PushNotifications }) =>
      PushNotifications.addListener("pushNotificationActionPerformed", action => {
        if (!userId || stopping) return;
        const value = action.notification.data?.url ?? "/";
        if (typeof value !== "string" || value.includes("\\")) return;
        try {
          const base = new URL(window.location.href);
          const target = new URL(value, base);
          // Compare protocol AND host: custom Capacitor schemes may have a
          // "null" origin even when their hosts are different.
          if (target.protocol !== base.protocol || target.host !== base.host ||
              target.username || target.password || target.pathname.startsWith("//")) return;
          window.location.assign(target.pathname + target.search + target.hash);
        } catch {
          // Ignore malformed or external navigation supplied in push data.
        }
      })).catch(error => {
        actionListener = null;
        throw error;
      });
  }
  await Promise.all([foregroundListener, actionListener]);
}

// Must finish with the OLD account's credentials, before clearing auth or logging
// into another account. A failed detach deliberately blocks logout for retry.
export async function cleanupPush(): Promise<void> {
  stopping = true;
  generation++;
  registeredUser = null;
  try {
    await pending?.catch(() => undefined);
    let endpoint = localStorage.getItem(ENDPOINT_KEY);
    let subscription: PushSubscription | null = null;
    if (getPlatform() === "web" && "serviceWorker" in navigator) {
      const registration = await navigator.serviceWorker.getRegistration("/");
      subscription = await registration?.pushManager.getSubscription() || null;
      endpoint = subscription?.endpoint || endpoint;
    }
    if (endpoint) await apiRequest("POST", "/api/push/unsubscribe", { endpoint });
    if (subscription) await subscription.unsubscribe();
    localStorage.removeItem(ENDPOINT_KEY);
  } catch {
    throw new Error("Kunne ikke slå av varsler for denne kontoen. Sjekk forbindelsen og prøv å logge ut igjen.");
  } finally {
    stopping = false;
  }
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  return Uint8Array.from(rawData, char => char.charCodeAt(0));
}