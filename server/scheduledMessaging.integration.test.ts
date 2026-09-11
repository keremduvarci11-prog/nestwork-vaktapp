import assert from "node:assert/strict";
import test from "node:test";
import { deliverNextScheduledMelding } from "./scheduledMessaging";
import { pool } from "./db";

/*
 * These tests intentionally require an explicit development-only opt-in. They
 * use fake recipient/sender IDs and never create push subscriptions, so they
 * can be run against the development database without contacting real users.
 *
 * Example:
 *   NODE_ENV=development \
 *   RUN_SCHEDULED_MESSAGING_INTEGRATION=1 \
 *   npx tsx --test server/scheduledMessaging.integration.test.ts
 */
const databaseUrl = process.env.DATABASE_URL || "";
const productionDatabaseUrl = /(?:^|[./_-])prod(?:uction)?(?:[./?_-]|$)/i.test(databaseUrl);
const integrationEnabled =
  process.env.RUN_SCHEDULED_MESSAGING_INTEGRATION === "1" &&
  process.env.NODE_ENV === "development" &&
  !productionDatabaseUrl;
const integrationSkipReason = integrationEnabled
  ? false
  : "scheduled messaging PostgreSQL integration tests require an explicit development-only opt-in";

let idSequence = 0;

type TestIds = {
  scheduleId: string;
  recipientId: string;
};

function testIds(label: string): TestIds {
  idSequence += 1;
  const token = `${process.pid}-${Date.now()}-${idSequence}`;
  return {
    scheduleId: `scheduled-messaging-test-${label}-${token}`,
    recipientId: `scheduled-messaging-test-recipient-${token}`,
  };
}

async function insertScheduledMelding(
  ids: TestIds,
  options: {
    due: boolean;
    status?: "pending" | "cancelled";
    subject?: string;
  },
): Promise<void> {
  const scheduledFor = options.due
    ? "now() - interval '1 second'"
    : "now() + interval '1 hour'";
  await pool.query(
    `INSERT INTO scheduled_meldinger (
       id, from_user_id, to_user_id, subject, message,
       scheduled_for, timezone, status, next_attempt_at
     )
     VALUES ($1, $2, $3, $4, $5, ${scheduledFor}, 'Europe/Oslo', $6, now())`,
    [
      ids.scheduleId,
      `scheduled-messaging-test-sender-${ids.scheduleId}`,
      ids.recipientId,
      options.subject || "Integrasjonstest",
      "Integrasjonstestinnhold",
      options.status || "pending",
    ],
  );
}

async function countRows(table: "meldinger" | "varsler", ids: TestIds): Promise<number> {
  const result = await pool.query<{ count: string }>(
    table === "meldinger"
      ? "SELECT count(*)::text AS count FROM meldinger WHERE scheduled_message_id = $1"
      : "SELECT count(*)::text AS count FROM varsler WHERE user_id = $1",
    [table === "meldinger" ? ids.scheduleId : ids.recipientId],
  );
  return Number(result.rows[0]?.count || 0);
}

async function scheduleState(ids: TestIds): Promise<{
  status: string;
  attempts: number;
  melding_id: string | null;
}> {
  const result = await pool.query<{
    status: string;
    attempts: number;
    melding_id: string | null;
  }>(
    `SELECT status, attempts, melding_id
     FROM scheduled_meldinger
     WHERE id = $1`,
    [ids.scheduleId],
  );
  assert.equal(result.rows.length, 1);
  return result.rows[0];
}

async function cleanUp(ids: TestIds): Promise<void> {
  // The fake recipient ID must never have a push subscription. This delete is
  // scoped to the test ID and also makes rerunning an interrupted test safe.
  await pool.query("DELETE FROM push_subscriptions WHERE user_id = $1", [ids.recipientId]);
  await pool.query("DELETE FROM varsler WHERE user_id = $1", [ids.recipientId]);
  await pool.query("DELETE FROM meldinger WHERE scheduled_message_id = $1", [ids.scheduleId]);
  await pool.query("DELETE FROM scheduled_meldinger WHERE id = $1", [ids.scheduleId]);
}

test("a future scheduled message is not delivered and has no varsel", {
  skip: integrationSkipReason,
}, async () => {
  const ids = testIds("future");
  try {
    await insertScheduledMelding(ids, { due: false });

    const delivered = await deliverNextScheduledMelding();

    assert.equal(delivered, null);
    assert.equal(await countRows("meldinger", ids), 0);
    assert.equal(await countRows("varsler", ids), 0);
    assert.deepEqual(await scheduleState(ids), {
      status: "pending",
      attempts: 0,
      melding_id: null,
    });
  } finally {
    await cleanUp(ids);
  }
});

test("parallel workers deliver a due message once with one varsel", {
  skip: integrationSkipReason,
}, async () => {
  const ids = testIds("parallel");
  try {
    await insertScheduledMelding(ids, { due: true });

    const deliveries = (await Promise.all([
      deliverNextScheduledMelding(),
      deliverNextScheduledMelding(),
    ])).filter((delivery): delivery is NonNullable<typeof delivery> => delivery !== null);

    assert.equal(deliveries.length, 1);
    assert.equal(deliveries[0]?.scheduleId, ids.scheduleId);
    assert.equal(await countRows("meldinger", ids), 1);
    assert.equal(await countRows("varsler", ids), 1);
    assert.deepEqual(await scheduleState(ids), {
      status: "sent",
      attempts: 0,
      melding_id: deliveries[0]?.messageId,
    });
  } finally {
    await cleanUp(ids);
  }
});

test("a cancelled scheduled message is never delivered", {
  skip: integrationSkipReason,
}, async () => {
  const ids = testIds("cancelled");
  try {
    await insertScheduledMelding(ids, { due: true, status: "cancelled" });

    const delivered = await deliverNextScheduledMelding();

    assert.equal(delivered, null);
    assert.equal(await countRows("meldinger", ids), 0);
    assert.equal(await countRows("varsler", ids), 0);
    assert.deepEqual(await scheduleState(ids), {
      status: "cancelled",
      attempts: 0,
      melding_id: null,
    });
  } finally {
    await cleanUp(ids);
  }
});

test("a failed transaction rolls back message and varsel, then retries", {
  skip: integrationSkipReason,
}, async () => {
  const ids = testIds("rollback");
  const triggerName = "scheduled_messaging_test_fail_varsler";
  const functionName = "scheduled_messaging_test_fail_varsler_fn";

  try {
    await cleanUp(ids);
    await pool.query(`DROP TRIGGER IF EXISTS ${triggerName} ON varsler`);
    await pool.query(`DROP FUNCTION IF EXISTS ${functionName}()`);
    await pool.query(`
      CREATE FUNCTION ${functionName}() RETURNS trigger
      LANGUAGE plpgsql
      AS $$
      BEGIN
        IF NEW.message = 'Integrasjonstest rollback' THEN
          RAISE EXCEPTION 'scheduled messaging integration rollback';
        END IF;
        RETURN NEW;
      END;
      $$`);
    await pool.query(`
      CREATE TRIGGER ${triggerName}
      BEFORE INSERT ON varsler
      FOR EACH ROW EXECUTE FUNCTION ${functionName}()`);

    await insertScheduledMelding(ids, {
      due: true,
      subject: "Integrasjonstest rollback",
    });

    assert.equal(await deliverNextScheduledMelding(), null);
    assert.equal(await countRows("meldinger", ids), 0);
    assert.equal(await countRows("varsler", ids), 0);
    assert.deepEqual(await scheduleState(ids), {
      status: "error",
      attempts: 1,
      melding_id: null,
    });

    await pool.query(`DROP TRIGGER ${triggerName} ON varsler`);
    await pool.query(`DROP FUNCTION ${functionName}()`);
    await pool.query(
      "UPDATE scheduled_meldinger SET next_attempt_at = now() WHERE id = $1",
      [ids.scheduleId],
    );

    const retried = await deliverNextScheduledMelding();

    assert.equal(retried?.scheduleId, ids.scheduleId);
    assert.equal(await countRows("meldinger", ids), 1);
    assert.equal(await countRows("varsler", ids), 1);
    assert.equal((await scheduleState(ids)).status, "sent");
  } finally {
    await pool.query(`DROP TRIGGER IF EXISTS ${triggerName} ON varsler`);
    await pool.query(`DROP FUNCTION IF EXISTS ${functionName}()`);
    await cleanUp(ids);
  }
});