import { apiRequest } from "./queryClient";

export async function initPush() {
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
      await subscribeToPush();
    } else {
      console.log("[Push] Permission:", Notification.permission);
    }
  } catch (err) {
    console.error("[Push] Init error:", err);
  }
}

export async function subscribeToPush() {
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

    let res: Response;
    try {
      res = await fetch("/api/push/vapid-key");
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
