import webpush from "web-push";
import { storage } from "./storage";

const VAPID_PUBLIC = process.env.VAPID_PUBLIC_KEY || "";
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY || "";

if (VAPID_PUBLIC && VAPID_PRIVATE) {
  webpush.setVapidDetails("mailto:post@nestwork.no", VAPID_PUBLIC, VAPID_PRIVATE);
  console.log("[Push] VAPID keys configured successfully");
} else {
  console.warn("[Push] WARNING: VAPID keys not set - push notifications disabled");
}

export async function sendNotification(userId: string, title: string, message: string, type: string = "info", link?: string) {
  await storage.createVarsel({ userId, title, message, type, read: false, link: link || null });

  if (!VAPID_PUBLIC || !VAPID_PRIVATE) {
    console.log("[Push] Skipping push - VAPID keys not configured");
    return;
  }

  try {
    const subs = await storage.getPushSubscriptions(userId);
    console.log(`[Push] Sending to user ${userId}: ${subs.length} subscription(s) found. Title: "${title}"`);

    if (subs.length === 0) {
      console.log(`[Push] No push subscriptions for user ${userId} - notification saved as varsel only`);
      return;
    }

    for (const sub of subs) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify({ title, body: message, url: link || "/" })
        );
        console.log(`[Push] SUCCESS: Sent to ${sub.endpoint.substring(0, 60)}...`);
      } catch (err: any) {
        console.error(`[Push] FAILED: status=${err.statusCode}, endpoint=${sub.endpoint.substring(0, 60)}...`);
        if (err.statusCode === 410) {
          console.log(`[Push] Subscription expired (410 Gone) - removing endpoint`);
          await storage.deletePushSubscription(sub.endpoint);
        } else if (err.statusCode === 404) {
          console.log(`[Push] Subscription not found (404) - removing endpoint`);
          await storage.deletePushSubscription(sub.endpoint);
        } else {
          console.error(`[Push] Non-fatal error (keeping subscription): ${err.message}`);
        }
      }
    }
  } catch (err) {
    console.error("[Push] Error in sendNotification:", err);
  }
}

export async function notifyRegion(region: string, title: string, message: string, type: string = "vakt", link?: string) {
  const regionGroups: Record<string, string[]> = {
    Bergen: ["Bergen", "Os"],
    Os: ["Bergen", "Os"],
  };
  const regions = regionGroups[region] || [region];

  const regionUsers = await storage.getUsersByRegions(regions);
  console.log(`[Push] notifyRegion "${region}" -> ${regions.join(", ")} -> ${regionUsers.length} users`);
  for (const user of regionUsers) {
    await sendNotification(user.id, title, message, type, link);
  }
}

export async function notifyUser(userId: string, title: string, message: string, type: string = "info", link?: string) {
  await sendNotification(userId, title, message, type, link);
}

export async function notifyAdmins(title: string, message: string, type: string = "info", link?: string) {
  const allUsers = await storage.getAllUsers();
  const admins = allUsers.filter(u => u.role === "admin");
  for (const admin of admins) {
    await sendNotification(admin.id, title, message, type, link);
  }
}
