import webpush from "web-push";
import { storage } from "./storage";

const VAPID_PUBLIC = process.env.VAPID_PUBLIC_KEY || "";
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY || "";

if (VAPID_PUBLIC && VAPID_PRIVATE) {
  webpush.setVapidDetails("mailto:post@nestwork.no", VAPID_PUBLIC, VAPID_PRIVATE);
}

export async function sendNotification(userId: string, title: string, message: string, type: string = "info", link?: string) {
  await storage.createVarsel({ userId, title, message, type, read: false, link: link || null });

  try {
    const subs = await storage.getPushSubscriptions(userId);
    for (const sub of subs) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify({ title, body: message, url: link || "/" })
        );
      } catch (err: any) {
        if (err.statusCode === 410 || err.statusCode === 404) {
          await storage.deletePushSubscription(sub.endpoint);
        }
      }
    }
  } catch (err) {
    console.error("[Push] Error sending push:", err);
  }
}

export async function notifyRegion(region: string, title: string, message: string, type: string = "vakt", link?: string) {
  const regionGroups: Record<string, string[]> = {
    Bergen: ["Bergen", "Os"],
    Os: ["Bergen", "Os"],
  };
  const regions = regionGroups[region] || [region];

  const regionUsers = await storage.getUsersByRegions(regions);
  for (const user of regionUsers) {
    await sendNotification(user.id, title, message, type, link);
  }
}

export async function notifyUser(userId: string, title: string, message: string, type: string = "info", link?: string) {
  await sendNotification(userId, title, message, type, link);
}
