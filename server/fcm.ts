import { createPrivateKey, createSign } from "node:crypto";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const FCM_SCOPE = "https://www.googleapis.com/auth/firebase.messaging";
const DEFAULT_TIMEOUT_MS = 10_000;

type FetchLike = typeof fetch;

interface ServiceAccount {
  project_id: string;
  client_email: string;
  private_key: string;
  token_uri?: string;
}

export interface FcmSendResult {
  ok: boolean;
  invalidToken: boolean;
  status?: number;
  reason?: "missing_config" | "authentication" | "request";
}

export interface FcmSender {
  send(deviceToken: string, title: string, body: string, link?: string): Promise<FcmSendResult>;
}

interface FcmSenderOptions {
  serviceAccountJson?: string;
  fetchImpl?: FetchLike;
  timeoutMs?: number;
  now?: () => number;
  logger?: Pick<Console, "warn" | "error">;
}

function base64Url(value: string | Buffer): string {
  return Buffer.from(value).toString("base64url");
}

function readServiceAccount(raw: string | undefined): ServiceAccount | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<ServiceAccount>;
    if (
      typeof value.project_id !== "string" ||
      !value.project_id.trim() ||
      typeof value.client_email !== "string" ||
      !value.client_email.includes("@") ||
      typeof value.private_key !== "string" ||
      !value.private_key.includes("-----BEGIN PRIVATE KEY-----") ||
      (value.token_uri !== undefined &&
        (typeof value.token_uri !== "string" || value.token_uri !== TOKEN_URL))
    ) {
      return null;
    }
    const key = createPrivateKey(value.private_key);
    if (key.asymmetricKeyType !== "rsa" && key.asymmetricKeyType !== "rsa-pss") {
      return null;
    }
    return value as ServiceAccount;
  } catch {
    return null;
  }
}

async function fetchWithTimeout(
  fetchImpl: FetchLike,
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchImpl(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export function createFcmSender(options: FcmSenderOptions = {}): FcmSender {
  const account = readServiceAccount(options.serviceAccountJson);
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const now = options.now ?? Date.now;
  const logger = options.logger ?? console;
  let warnedAboutConfig = false;
  let accessToken: { value: string; expiresAt: number } | null = null;
  let tokenRequest: Promise<string> | null = null;

  function warnMissingConfigOnce() {
    if (!warnedAboutConfig) {
      warnedAboutConfig = true;
      logger.warn(
        "[Push] FCM disabled: FIREBASE_SERVICE_ACCOUNT_JSON is missing or invalid",
      );
    }
  }

  async function requestAccessToken(): Promise<string> {
    if (!account) throw new Error("FCM_CONFIG");
    if (accessToken && accessToken.expiresAt > now()) return accessToken.value;
    if (tokenRequest) return tokenRequest;

    tokenRequest = (async () => {
      const issuedAt = Math.floor(now() / 1000);
      const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
      const claims = base64Url(
        JSON.stringify({
          iss: account.client_email,
          scope: FCM_SCOPE,
          aud: TOKEN_URL,
          iat: issuedAt,
          exp: issuedAt + 3600,
        }),
      );
      const unsignedJwt = `${header}.${claims}`;
      const signer = createSign("RSA-SHA256");
      signer.update(unsignedJwt);
      signer.end();
      const assertion = `${unsignedJwt}.${base64Url(signer.sign(account.private_key))}`;

      const response = await fetchWithTimeout(
        fetchImpl,
        TOKEN_URL,
        {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
            assertion,
          }),
        },
        timeoutMs,
      );
      if (!response.ok) throw new Error("FCM_AUTH");

      const result = (await response.json()) as {
        access_token?: unknown;
        expires_in?: unknown;
      };
      if (
        typeof result.access_token !== "string" ||
        !result.access_token ||
        typeof result.expires_in !== "number" ||
        !Number.isFinite(result.expires_in)
      ) {
        throw new Error("FCM_AUTH");
      }
      accessToken = {
        value: result.access_token,
        expiresAt: now() + Math.max(0, result.expires_in - 60) * 1000,
      };
      return result.access_token;
    })();

    try {
      return await tokenRequest;
    } finally {
      tokenRequest = null;
    }
  }

  return {
    async send(deviceToken, title, body, link): Promise<FcmSendResult> {
      if (!account) {
        warnMissingConfigOnce();
        return { ok: false, invalidToken: false, reason: "missing_config" };
      }

      let token: string;
      try {
        token = await requestAccessToken();
      } catch {
        logger.error("[Push] FCM authentication failed");
        return { ok: false, invalidToken: false, reason: "authentication" };
      }

      try {
        const response = await fetchWithTimeout(
          fetchImpl,
          `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(account.project_id)}/messages:send`,
          {
            method: "POST",
            headers: {
              authorization: `Bearer ${token}`,
              "content-type": "application/json",
            },
            body: JSON.stringify({
              message: {
                token: deviceToken,
                notification: { title, body },
                data: { url: link || "/" },
                android: {
                  priority: "high",
                  notification: {
                    channel_id: "nestwork_updates",
                    icon: "ic_stat_nestwork",
                    sound: "default",
                  },
                },
              },
            }),
          },
          timeoutMs,
        );

        if (response.ok) return { ok: true, invalidToken: false, status: response.status };

        let errorCode: unknown;
        try {
          const result = (await response.json()) as {
            error?: { details?: Array<{ errorCode?: unknown }> };
          };
          errorCode = result.error?.details?.find(
            (detail) => detail.errorCode === "UNREGISTERED",
          )?.errorCode;
        } catch {
          // The HTTP status is enough to report a failed attempt.
        }
        return {
          ok: false,
          invalidToken: errorCode === "UNREGISTERED",
          status: response.status,
          reason: "request",
        };
      } catch {
        return { ok: false, invalidToken: false, reason: "request" };
      }
    },
  };
}

let environmentSender: FcmSender | null = null;

export function sendFcm(
  deviceToken: string,
  title: string,
  body: string,
  link?: string,
): Promise<FcmSendResult> {
  environmentSender ??= createFcmSender({
    serviceAccountJson: process.env.FIREBASE_SERVICE_ACCOUNT_JSON,
  });
  return environmentSender.send(deviceToken, title, body, link);
}