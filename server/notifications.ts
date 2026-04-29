import webpush from "web-push";
import apn from "@parse/node-apn";
import { storage } from "./storage";

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
    console.error("[Push] APNS provider failed to initialize:", err);
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
      console.log(`[Push] APNS SUCCESS: ${deviceToken.substring(0, 16)}...`);
      return { ok: true, expired: false };
    }
    if (result.failed.length > 0) {
      const f = result.failed[0];
      const reason = (f.response as any)?.reason || f.error?.message || "unknown";
      const status = f.status;
      console.error(`[Push] APNS FAILED: status=${status}, reason=${reason}, token=${deviceToken.substring(0, 16)}...`);
      const expired = reason === "Unregistered" || reason === "BadDeviceToken" || status === 410;
      return { ok: false, expired };
    }
    return { ok: false, expired: false };
  } catch (err: any) {
    console.error("[Push] APNS error:", err.message);
    return { ok: false, expired: false };
  }
}

export async function sendNotification(userId: string, title: string, message: string, type: string = "info", link?: string) {
  await storage.createVarsel({ userId, title, message, type, read: false, link: link || null });

  try {
    const subs = await storage.getPushSubscriptions(userId);
    console.log(`[Push] Sending to user ${userId}: ${subs.length} subscription(s) found. Title: "${title}"`);

    if (subs.length === 0) {
      console.log(`[Push] No push subscriptions for user ${userId} - notification saved as varsel only`);
      return;
    }

    for (const sub of subs) {
      const endpoint = sub.endpoint;

      if (endpoint.startsWith("apns://")) {
        const deviceToken = endpoint.replace("apns://", "");
        const result = await sendApns(deviceToken, title, message, link);
        if (result.expired) {
          console.log(`[Push] APNS token expired - removing endpoint`);
          await storage.deletePushSubscription(endpoint);
        }
        continue;
      }

      if (endpoint.startsWith("fcm://")) {
        console.log(`[Push] FCM endpoint not yet supported (Android), skipping`);
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
        console.log(`[Push] WEB SUCCESS: Sent to ${sub.endpoint.substring(0, 60)}...`);
      } catch (err: any) {
        console.error(`[Push] WEB FAILED: status=${err.statusCode}, endpoint=${sub.endpoint.substring(0, 60)}...`);
        if (err.statusCode === 410 || err.statusCode === 404) {
          console.log(`[Push] Subscription expired (${err.statusCode}) - removing endpoint`);
          await storage.deletePushSubscription(sub.endpoint);
        }
      }
    }
  } catch (err) {
    console.error("[Push] Error in sendNotification:", err);
  }
}

const TEST_USERNAMES = (process.env.TEST_USERNAMES || "amandafrederich")
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

export async function notifyRegion(region: string, title: string, message: string, type: string = "vakt", link?: string) {
  const regionGroups: Record<string, string[]> = {
    Bergen: ["Bergen", "Os"],
    Os: ["Bergen", "Os"],
  };
  const regions = regionGroups[region] || [region];

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
  const recipients = Array.from(byId.values());

  console.log(
    `[Push] notifyRegion "${region}" -> ${regions.join(", ")} -> ${regionUsers.length} region + ${testUsers.length} test = ${recipients.length} total`
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
