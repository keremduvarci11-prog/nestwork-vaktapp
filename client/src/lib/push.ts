import { apiRequest } from "./queryClient";
import { getAuthToken } from "./token";

function isCapacitorNative(): boolean {
  return !!(window as any).Capacitor?.isNativePlatform?.();
}

function getPlatform(): string {
  return (window as any).Capacitor?.getPlatform?.() || "web";
}

export async function initPush() {
  const platform = getPlatform();
  if (platform === "ios") {
    await initCapacitorPush();
  } else if (platform === "android") {
    console.log("[Push] Android native push disabled (FCM not configured)");
  } else {
    await initWebPush();
  }
}

export async function subscribeToPush() {
  const platform = getPlatform();
  if (platform === "ios") {
    await requestCapacitorPermission();
  } else if (platform === "android") {
    console.log("[Push] Android native push disabled (FCM not configured)");
  } else {
    await subscribeWebPush();
  }
}

function debugAlert(msg: string) {
  console.log("[Push]", msg);
  try {
    (window as any).__pushDebug = ((window as any).__pushDebug || []).concat([new Date().toISOString().substring(11, 19) + " " + msg]);
    if (typeof document === "undefined") return;
    let box = document.getElementById("__push_debug_box");
    if (!box) {
      box = document.createElement("div");
      box.id = "__push_debug_box";
      box.style.cssText = "position:fixed;bottom:8px;left:8px;right:8px;max-height:30vh;overflow:auto;background:rgba(0,0,0,0.85);color:#0f0;font:11px/1.3 monospace;padding:8px;border-radius:8px;z-index:99999;white-space:pre-wrap;word-break:break-all;";
      box.onclick = () => box && box.remove();
      document.body.appendChild(box);
    }
    box.textContent = ((window as any).__pushDebug as string[]).slice(-15).join("\n") + "\n\n(tap to close)";
  } catch {}
}

async function initCapacitorPush() {
  try {
    const { PushNotifications } = await import("@capacitor/push-notifications");
    const permStatus = await PushNotifications.checkPermissions();
    debugAlert("perm status: " + permStatus.receive);
    if (permStatus.receive === "granted") {
      await registerCapacitorPush();
    } else {
      await requestCapacitorPermission();
    }
  } catch (err: any) {
    debugAlert("init error: " + (err?.message || err));
  }
}

async function requestCapacitorPermission() {
  try {
    const { PushNotifications } = await import("@capacitor/push-notifications");
    const result = await PushNotifications.requestPermissions();
    debugAlert("perm result: " + result.receive);
    if (result.receive === "granted") {
      await registerCapacitorPush();
    } else {
      debugAlert("PERMISSION DENIED - cannot register push");
    }
  } catch (err: any) {
    debugAlert("perm request error: " + (err?.message || err));
  }
}

let capacitorListenersInstalled = false;
let capacitorRegisterCalled = false;

async function registerCapacitorPush() {
  try {
    const { PushNotifications } = await import("@capacitor/push-notifications");
    const platform = (window as any).Capacitor?.getPlatform?.() || "unknown";
    const scheme = platform === "ios" ? "apns" : "fcm";

    if (!capacitorListenersInstalled) {
      capacitorListenersInstalled = true;

      await PushNotifications.addListener("registration", async (token) => {
        debugAlert(`got ${platform} token (${token.value.length} chars): ${token.value.substring(0, 16)}...`);
        try {
          await apiRequest("POST", "/api/push/subscribe", {
            endpoint: `${scheme}://${token.value}`,
            keys: { deviceToken: token.value },
          });
          debugAlert(`token sent to server (${scheme}://) OK`);
        } catch (err: any) {
          debugAlert("send token FAILED: " + (err?.message || err));
        }
      });

      await PushNotifications.addListener("registrationError", (err: any) => {
        debugAlert("REGISTRATION ERROR: " + JSON.stringify(err));
      });

      await PushNotifications.addListener("pushNotificationReceived", (notification) => {
        debugAlert("notification received: " + notification.title);
      });
    }

    if (!capacitorRegisterCalled) {
      capacitorRegisterCalled = true;
      await PushNotifications.register();
      debugAlert("register() called");
    } else {
      debugAlert("register() already called, skipping");
    }
  } catch (err: any) {
    debugAlert("register error: " + (err?.message || err));
  }
}

async function initWebPush() {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    console.log("[Push] Service Worker or PushManager not supported");
    return;
  }

  try {
    await navigator.serviceWorker.register("/sw.js", { scope: "/" });
    await navigator.serviceWorker.ready;
    console.log("[Push] Service Worker registered");

    if (Notification.permission === "granted") {
      console.log("[Push] Permission already granted, re-syncing subscription");
      await subscribeWebPush();
    } else {
      console.log("[Push] Permission:", Notification.permission);
    }
  } catch (err) {
    console.error("[Push] Init error:", err);
  }
}

async function subscribeWebPush() {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    console.log("[Push] Service Worker or PushManager not supported");
    return;
  }

  try {
    const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
    await navigator.serviceWorker.ready;
    console.log("[Push] Service Worker registered");

    const permission = await Notification.requestPermission();
    console.log("[Push] Permission:", permission);
    if (permission !== "granted") return;

    const headers: Record<string, string> = {};
    const token = getAuthToken();
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    let res: Response;
    try {
      res = await fetch("/api/push/vapid-key", { headers });
      if (!res.ok) {
        console.log("[Push] VAPID key fetch failed:", res.status);
        return;
      }
    } catch (e) {
      console.log("[Push] VAPID key fetch error:", e);
      return;
    }
    let data: any;
    try {
      data = await res.json();
    } catch { return; }
    const key = data?.key;
    if (!key) {
      console.log("[Push] No VAPID key returned");
      return;
    }

    const existing = await registration.pushManager.getSubscription();
    if (existing) {
      console.log("[Push] Re-sending existing subscription");
      await sendSubscription(existing);
      return;
    }

    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(key),
    });

    console.log("[Push] New subscription created");
    await sendSubscription(subscription);
  } catch (err) {
    console.error("[Push] Subscription error:", err);
  }
}

async function sendSubscription(subscription: PushSubscription) {
  const json = subscription.toJSON();
  try {
    await apiRequest("POST", "/api/push/subscribe", {
      endpoint: json.endpoint,
      keys: json.keys,
    });
    console.log("[Push] Subscription sent to server");
  } catch (err) {
    console.error("[Push] Failed to send subscription:", err);
  }
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}
