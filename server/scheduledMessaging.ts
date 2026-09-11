import { pool } from "./db";
import { sendPushNotificationOnly } from "./notifications";
import { storage } from "./storage";
import type { Melding } from "@shared/schema";

export const SCHEDULED_MESSAGING_TIMEZONE = "Europe/Oslo";
const WORKER_INTERVAL_MS = 30_000;
const RETRY_DELAY_MS = 5 * 60_000;

type ScheduleStatus = "pending" | "error" | "sent" | "cancelled";

type DueScheduleRow = {
  id: string;
  from_user_id: string;
  to_user_id: string;
  from_user_name: string;
  subject: string;
  message: string;
  scheduled_for: Date;
  timezone: string;
  attempts: number;
};

export type DeliveredScheduledMelding = {
  scheduleId: string;
  messageId: string;
  fromUserId: string;
  toUserId: string;
  subject: string;
  message: string;
};

/**
 * Kept separate from the worker so the "not before due" guarantee can be
 * checked without a database or clock mock.
 */
export function isScheduledMessageDue(
  status: ScheduleStatus,
  scheduledFor: Date,
  now: Date = new Date(),
): boolean {
  return (
    (status === "pending" || status === "error") &&
    scheduledFor.getTime() <= now.getTime()
  );
}

export function scheduledMessageRetryDelayMs(): number {
  return RETRY_DELAY_MS;
}

function errorMessage(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).slice(0, 2000);
}

async function recordDeliveryError(scheduleId: string, message: string): Promise<void> {
  await pool.query(
    `UPDATE scheduled_meldinger
     SET status = 'error',
         attempts = attempts + 1,
         last_error = $2,
         next_attempt_at = now() + ($3 * interval '1 millisecond')
     WHERE id = $1 AND status IN ('pending', 'error')`,
    [scheduleId, message, RETRY_DELAY_MS],
  );
}

/**
 * Claims and delivers one due row in a single database transaction. The row
 * lock is held until both the in-app message and the sent marker are committed,
 * so two app instances cannot create duplicate visible messages.
 */
export async function deliverNextScheduledMelding(): Promise<DeliveredScheduledMelding | null> {
  const client = await pool.connect();
  let scheduleId: string | null = null;

  try {
    await client.query("BEGIN");
    const due = await client.query<DueScheduleRow>(
      `SELECT scheduled.id,
              scheduled.from_user_id,
              scheduled.to_user_id,
              COALESCE(sender.name, 'Nestwork Admin') AS from_user_name,
              scheduled.subject,
              scheduled.message,
              scheduled.scheduled_for,
              scheduled.timezone,
              scheduled.attempts
       FROM scheduled_meldinger AS scheduled
       LEFT JOIN users AS sender ON sender.id = scheduled.from_user_id
       WHERE scheduled.status IN ('pending', 'error')
         AND scheduled.scheduled_for <= now()
         AND scheduled.next_attempt_at <= now()
       ORDER BY scheduled.scheduled_for, scheduled.created_at
       LIMIT 1
       FOR UPDATE OF scheduled SKIP LOCKED`,
    );

    const schedule = due.rows[0];
    if (!schedule) {
      await client.query("COMMIT");
      return null;
    }
    scheduleId = schedule.id;

    const inserted = await client.query<Pick<Melding, "id" | "fromUserId" | "toUserId" | "subject" | "message">>(
      `INSERT INTO meldinger (
         from_user_id, to_user_id, subject, message, scheduled_message_id
       )
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (scheduled_message_id) DO NOTHING
       RETURNING
         id,
         from_user_id AS "fromUserId",
         to_user_id AS "toUserId",
         subject,
         message`,
      [schedule.from_user_id, schedule.to_user_id, schedule.subject, schedule.message, schedule.id],
    );

    let message = inserted.rows[0];
    if (message) {
      await client.query(
        `INSERT INTO varsler (user_id, title, message, type, read, link)
         VALUES ($1, $2, $3, 'melding', false, $4)`,
        [
          schedule.to_user_id,
          `${schedule.from_user_name} sendte deg en melding`,
          schedule.subject,
          "/meldinger",
        ],
      );
    }
    if (!message) {
      const existing = await client.query<Pick<Melding, "id" | "fromUserId" | "toUserId" | "subject" | "message">>(
        `SELECT id,
                from_user_id AS "fromUserId",
                to_user_id AS "toUserId",
                subject,
                message
         FROM meldinger
         WHERE scheduled_message_id = $1
         LIMIT 1`,
        [schedule.id],
      );
      message = existing.rows[0];
    }
    if (!message) {
      throw new Error("Kunne ikke opprette planlagt melding");
    }

    const marked = await client.query(
      `UPDATE scheduled_meldinger
       SET status = 'sent',
           melding_id = $1,
           sent_at = now(),
           last_error = NULL,
           next_attempt_at = now()
       WHERE id = $2 AND status IN ('pending', 'error')
       RETURNING id`,
      [message.id, schedule.id],
    );
    if (!marked.rows[0]) {
      throw new Error("Planlagt melding ble kansellert eller levert av en annen arbeider");
    }

    await client.query("COMMIT");
    return {
      scheduleId: schedule.id,
      messageId: message.id,
      fromUserId: message.fromUserId || schedule.from_user_id,
      toUserId: message.toUserId || schedule.to_user_id,
      subject: message.subject,
      message: message.message,
    };
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // Preserve the original delivery error.
    }
    if (scheduleId) {
      try {
        await recordDeliveryError(scheduleId, errorMessage(error));
      } catch (recordError) {
        console.error("[ScheduledMessaging] Kunne ikke lagre leveringsfeil:", errorMessage(recordError));
      }
    }
    console.error("[ScheduledMessaging] Levering feilet:", errorMessage(error));
    return null;
  } finally {
    client.release();
  }
}

export async function drainDueScheduledMeldinger(): Promise<void> {
  while (true) {
    const delivered = await deliverNextScheduledMelding();
    if (!delivered) return;

    // Push is deliberately outside the transaction. A push failure must not
    // make the durable in-app delivery retry and create a duplicate.
    try {
      const sender = await storage.getUser(delivered.fromUserId);
      await sendPushNotificationOnly(
        delivered.toUserId,
        `${sender?.name || "Nestwork Admin"} sendte deg en melding`,
        delivered.subject,
        "/meldinger",
      );
    } catch (error) {
      console.error("[ScheduledMessaging] Push etter levering feilet:", errorMessage(error));
    }
  }
}

let workerPromise: Promise<void> | null = null;
let workerStarted = false;

function kickWorker(): void {
  if (workerPromise) return;
  workerPromise = drainDueScheduledMeldinger()
    .catch((error) => console.error("[ScheduledMessaging] Arbeiderfeil:", errorMessage(error)))
    .finally(() => {
      workerPromise = null;
    });
}

/**
 * Starts an in-process durable queue worker. Autoscale deployments do not
 * guarantee a sleeping instance will wake for a future due time; production
 * should therefore use an always-on deployment for this worker.
 */
export function startScheduledMessagingWorker(): void {
  if (workerStarted) return;
  workerStarted = true;
  kickWorker();
  const timer = setInterval(kickWorker, WORKER_INTERVAL_MS);
  timer.unref();
  console.log("[ScheduledMessaging] Varig planlagt-meldingsarbeider startet");
}

export function scheduledMeldingIsCancellable(status: string): boolean {
  return status === "pending" || status === "error";
}
