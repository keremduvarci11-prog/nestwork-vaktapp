import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import test from "node:test";
import { createFcmSender } from "./fcm";

const privateKey = generateKeyPairSync("rsa", { modulusLength: 2048 })
  .privateKey.export({ type: "pkcs8", format: "pem" })
  .toString();
const config = JSON.stringify({
  project_id: "network-free-project",
  client_email: "sender@network-free-project.iam.gserviceaccount.com",
  private_key: privateKey,
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

test("FCM sender exchanges a JWT, caches the token, and builds Android v1 payload", async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const fetchImpl = async (url: string | URL | Request, init?: RequestInit) => {
    requests.push({ url: String(url), init });
    if (requests.length === 1) {
      return jsonResponse({ access_token: "synthetic-access-token", expires_in: 3600 });
    }
    return jsonResponse({ name: "synthetic-message-name" });
  };
  const sender = createFcmSender({
    serviceAccountJson: config,
    fetchImpl: fetchImpl as typeof fetch,
    now: () => 1_700_000_000_000,
  });

  assert.deepEqual(await sender.send("device-one", "Title", "Body", "/vakter/1"), {
    ok: true,
    invalidToken: false,
    status: 200,
  });
  assert.equal((await sender.send("device-two", "Other", "Message")).ok, true);
  assert.equal(requests.length, 3);

  const tokenForm = new URLSearchParams(String(requests[0].init?.body));
  assert.equal(tokenForm.get("grant_type"), "urn:ietf:params:oauth:grant-type:jwt-bearer");
  assert.equal(tokenForm.get("assertion")?.split(".").length, 3);

  const payload = JSON.parse(String(requests[1].init?.body));
  assert.deepEqual(payload, {
    message: {
      token: "device-one",
      notification: { title: "Title", body: "Body" },
      data: { url: "/vakter/1" },
      android: {
        priority: "high",
        notification: {
          channel_id: "nestwork_updates",
          icon: "ic_stat_nestwork",
          sound: "default",
        },
      },
    },
  });
});

test("only an explicit FCM UNREGISTERED detail marks a token invalid", async () => {
  async function resultFor(errorCode: string) {
    let call = 0;
    const sender = createFcmSender({
      serviceAccountJson: config,
      fetchImpl: (async () => {
        call += 1;
        return call === 1
          ? jsonResponse({ access_token: "synthetic-access-token", expires_in: 3600 })
          : jsonResponse(
              { error: { status: "INVALID_ARGUMENT", details: [{ errorCode }] } },
              400,
            );
      }) as typeof fetch,
    });
    return sender.send("device", "Title", "Body");
  }

  assert.equal((await resultFor("UNREGISTERED")).invalidToken, true);
  assert.equal((await resultFor("INVALID_ARGUMENT")).invalidToken, false);
});

test("missing or invalid configuration logs once and never calls fetch", async () => {
  let fetchCalls = 0;
  const warnings: string[] = [];
  const sender = createFcmSender({
    serviceAccountJson: "{\"project_id\":\"incomplete\"}",
    fetchImpl: (async () => {
      fetchCalls += 1;
      throw new Error("must not run");
    }) as typeof fetch,
    logger: {
      warn: (message?: unknown) => warnings.push(String(message)),
      error: () => undefined,
    },
  });

  const first = await sender.send("device", "Title", "Body");
  const second = await sender.send("device", "Title", "Body");
  assert.equal(first.ok, false);
  assert.equal(first.reason, "missing_config");
  assert.equal(second.ok, false);
  assert.equal(fetchCalls, 0);
  assert.equal(warnings.length, 1);
  assert.equal(warnings[0].includes("FIREBASE_SERVICE_ACCOUNT_JSON"), true);
});