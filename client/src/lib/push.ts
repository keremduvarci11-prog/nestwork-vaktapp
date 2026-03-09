import { apiRequest } from "./queryClient";

export async function subscribeToPush() {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;

  try {
    const registration = await navigator.serviceWorker.register("/sw.js");
    let res: Response;
    try {
      res = await fetch("/api/push/vapid-key");
      if (!res.ok) return;
    } catch { return; }
    let data: any;
    try {
      data = await res.json();
    } catch { return; }
    const key = data?.key;
    if (!key) return;

    const existing = await registration.pushManager.getSubscription();
    if (existing) {
      await sendSubscription(existing);
      return;
    }

    const permission = await Notification.requestPermission();
    if (permission !== "granted") return;

    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(key),
    });

    await sendSubscription(subscription);
  } catch (err) {
    console.error("[Push] Subscription error:", err);
  }
}

async function sendSubscription(subscription: PushSubscription) {
  const json = subscription.toJSON();
  await apiRequest("POST", "/api/push/subscribe", {
    endpoint: json.endpoint,
    keys: json.keys,
  });
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
