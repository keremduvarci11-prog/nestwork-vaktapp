import webpush from "web-push";
import apn from "@parse/node-apn";
import { storage } from "./storage";
import { notificationRegions } from "@shared/regions";
import { sendFcm } from "./fcm";

const VAPID_PUBLIC = process.env.VAPID_PUBLIC_KEY || "";
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY || "";

if (VAPID_PUBLIC && VAPID_PRIVATE) {
  webpush.setVapidDetails("mailto:post@nestwork.no", VAPID_PUBLIC, VAPID_PRIVATE);
  console.log("[Push] VAPID keys configured successfully");
} else {
  console.warn("[Push] WARNING: VAPID keys not set - push notifications disabled");
}

const APNS_AUTH_KEY = process.env.APNS_AUTH_KEY || "";
const APNS_KEY_ID = process.env.APNS_KEY_ID || "";
const APNS_TEAM_ID = process.env.APNS_TEAM_ID || "";
const APNS_BUNDLE_ID = process.env.APNS_BUNDLE_ID || "";

function normalizeP8Key(raw: string): string {
  let key = raw.trim();
  if (key.includes("\\n")) key = key.replace(/\\n/g, "\n");
  if (!key.includes("-----BEGIN")) {
    const body = key.replace(/\s+/g, "");
    key =
      "-----BEGIN PRIVATE KEY-----\n" +
      (body.match(/.{1,64}/g) || []).join("\n") +
      "\n-----END PRIVATE KEY-----\n";
  }
  return key;
}

let apnProvider: apn.Provider | null = null;
if (APNS_AUTH_KEY && APNS_KEY_ID && APNS_TEAM_ID && APNS_BUNDLE_ID) {
  try {
    const normalizedKey = normalizeP8Key(APNS_AUTH_KEY);
    apnProvider = new apn.Provider({
      token: {
        key: normalizedKey,
        keyId: APNS_KEY_ID,
        teamId: APNS_TEAM_ID,
      },
      production: true,
    });
    console.log("[Push] APNS provider configured successfully (bundle:", APNS_BUNDLE_ID + ", keyId:", APNS_KEY_ID + ", teamId:", APNS_TEAM_ID + ")");
  } catch (err) {
    console.error("[Push] APNS provider failed to initialize");
  }
} else {
  console.warn("[Push] WARNING: APNS env vars not set - native iOS push disabled");
}

async function sendApns(deviceToken: string, title: string, body: string, link?: string) {
  if (!apnProvider) {
    console.log("[Push] APNS provider not configured");
    return { ok: false, expired: false };
  }
  const note = new apn.Notification();
  note.alert = { title, body };
  note.topic = APNS_BUNDLE_ID;
  note.sound = "default";
  note.badge = 1;
  note.payload = { url: link || "/" };
  note.contentAvailable = true;

  try {
    const result = await apnProvider.send(note, deviceToken);
    if (result.sent.length > 0) {
      console.log("[Push] APNS SUCCESS");
      return { ok: true, expired: false };
    }
    if (result.failed.length > 0) {
      const f = result.failed[0];
      const reason = (f.response as any)?.reason || f.error?.message || "unknown";
      const status = f.status;
      console.error(`[Push] APNS FAILED: status=${status}, reason=${reason}`);
      const expired = reason === "Unregistered" || reason === "BadDeviceToken" || status === 410;
      return { ok: false, expired };
    }
    return { ok: false, expired: false };
  } catch {
    console.error("[Push] APNS error");
    return { ok: false, expired: false };
  }
}

export async function sendPushNotificationOnly(userId: string, title: string, message: string, link?: string) {
  try {
    const subs = await storage.getPushSubscriptions(userId);
    console.log(`[Push] Sending push to user ${userId}: ${subs.length} subscription(s) found`);

    if (subs.length === 0) {
      return;
    }

    for (const sub of subs) {
      const endpoint = sub.endpoint;

      if (endpoint.startsWith("apns://")) {
        const deviceToken = endpoint.replace("apns://", "");
        const result = await sendApns(deviceToken, title, message, link);
        if (result.expired) {
          console.log(`[Push] APNS token expired - removing endpoint`);
          await storage.deletePushSubscription(endpoint, userId);
        }
        continue;
      }

      if (endpoint.startsWith("fcm://")) {
        const deviceToken = endpoint.slice("fcm://".length);
        const result = await sendFcm(deviceToken, title, message, link);
        if (result.ok) {
          console.log("[Push] FCM SUCCESS");
        } else if (result.invalidToken) {
          console.log("[Push] FCM token unregistered - removing subscription");
          await storage.deletePushSubscription(endpoint, userId);
        } else if (result.reason !== "missing_config") {
          console.error(
            `[Push] FCM FAILED${result.status ? `: status=${result.status}` : ""}`,
          );
        }
        continue;
      }

      if (!VAPID_PUBLIC || !VAPID_PRIVATE) {
        console.log("[Push] Skipping web push - VAPID keys not configured");
        continue;
      }

      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify({ title, body: message, url: link || "/" })
        );
        console.log("[Push] WEB SUCCESS");
      } catch (err: any) {
        console.error(`[Push] WEB FAILED: status=${err.statusCode}`);
        if (err.statusCode === 410 || err.statusCode === 404) {
          console.log(`[Push] Subscription expired (${err.statusCode}) - removing endpoint`);
          await storage.deletePushSubscription(sub.endpoint, userId);
        }
      }
    }
  } catch (err) {
    console.error("[Push] Error in sendPushNotificationOnly:", err);
  }
}

export async function sendNotification(userId: string, title: string, message: string, type: string = "info", link?: string) {
  // The in-app notification is persisted before push, while callers that only
  // need a push (for example scheduled messages after due delivery) can use
  // sendPushNotificationOnly without creating a visible varsel.
  await storage.createVarsel({ userId, title, message, type, read: false, link: link || null });
  await sendPushNotificationOnly(userId, title, message, link);
}

const TEST_USERNAMES = (process.env.TEST_USERNAMES || "amandafrederich")
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

export async function notifyRegion(
  region: string,
  title: string,
  message: string,
  type: string = "vakt",
  link?: string,
  excludedUserIds: string[] = []
) {
  const regions = notificationRegions(region);

  const regionUsers = await storage.getUsersByRegions(regions);

  // Test users always receive notifications regardless of region
  let testUsers: typeof regionUsers = [];
  if (TEST_USERNAMES.length > 0) {
    const allUsers = await storage.getAllUsers();
    testUsers = allUsers.filter(
      (u) => u.role === "ansatt" && TEST_USERNAMES.includes(u.username.toLowerCase())
    );
  }

  // Merge & dedupe by user id (test users in the matched region are not double-notified)
  const byId = new Map<string, typeof regionUsers[number]>();
  for (const u of [...regionUsers, ...testUsers]) byId.set(u.id, u);
  const excluded = new Set(excludedUserIds);
  const recipients = Array.from(byId.values()).filter((user) => !excluded.has(user.id));

  console.log(
    `[Push] notifyRegion "${region}" -> ${regions.join(", ")} -> ${regionUsers.length} region + ${testUsers.length} test, ${excluded.size} excluded = ${recipients.length} total`
  );

  for (const user of recipients) {
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
