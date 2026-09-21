import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { calculatePaidHours } from "@shared/shiftHours";
import { pool } from "./db";
import {
  applyWeek39Plan,
  previewWeek39Plan,
  type Week39Dependencies,
} from "./week39";
import {
  WEEK39_EMPLOYEE_EXTERNAL_ID,
  WEEK39_EMPLOYEE_ID,
  WEEK39_EMPLOYEE_NAME,
  WEEK39_KINDERGARTEN_ID,
  WEEK39_KINDERGARTEN_NAME,
  SULTAN_WEEK39,
} from "@shared/week39";

/*
 * This suite is deliberately opt-in and development-only. It creates an
 * isolated PostgreSQL schema containing synthetic identities and never calls
 * the real notification or sheet worker. It is therefore safe to leave in
 * the repository without accidentally writing production data.
 */
const databaseUrl = process.env.DATABASE_URL || "";
const productionDatabaseUrl = /(?:^|[./_-])prod(?:uction)?(?:[./?_-]|$)/i.test(databaseUrl);
const integrationEnabled =
  process.env.RUN_WEEK39_INTEGRATION === "1" &&
  process.env.NODE_ENV === "development" &&
  !productionDatabaseUrl;
const integrationSkipReason = integrationEnabled
  ? false
  : "week 39 PostgreSQL integration tests require explicit development-only opt-in";

let schema = "";
let sequence = 0;
const notificationCalls: string[] = [];

async function setupSchema(): Promise<void> {
  sequence += 1;
  schema = `week39_test_${process.pid}_${Date.now()}_${sequence}`;
  const client = await pool.connect();
  try {
    await client.query(`CREATE SCHEMA "${schema}"`);
    await client.query(`
      CREATE TABLE "${schema}".users (
        id varchar PRIMARY KEY, name text NOT NULL, external_id integer,
        role text NOT NULL, region text NOT NULL, user_status text NOT NULL
      );
      CREATE TABLE "${schema}".barnehager (
        id varchar PRIMARY KEY, name text NOT NULL, region text NOT NULL, aktiv boolean NOT NULL
      );
      CREATE TABLE "${schema}".vakter (
        id varchar PRIMARY KEY DEFAULT md5(random()::text || clock_timestamp()::text), barnehage_id varchar NOT NULL,
        dato date NOT NULL, start_tid time NOT NULL, slutt_tid time NOT NULL,
        vikarkode text NOT NULL, status text NOT NULL, ansatt_id varchar,
        region text NOT NULL, beskrivelse text, trekk_pause boolean NOT NULL DEFAULT false,
        betalt_pause boolean NOT NULL DEFAULT false, avtalte_betalte_timer decimal(6,2),
        timer_innsendt boolean NOT NULL DEFAULT false, timer_godkjent boolean NOT NULL DEFAULT false,
        lonn_utbetalt boolean DEFAULT false, syk_ikke_mott boolean DEFAULT false, provetime boolean DEFAULT false
      );
      CREATE TABLE "${schema}".sheet_sync_jobs (
        vakt_id varchar PRIMARY KEY,
        action text NOT NULL CHECK (action IN ('sync', 'delete')),
        payload jsonb,
        version bigint NOT NULL DEFAULT 1,
        generation uuid NOT NULL DEFAULT gen_random_uuid(),
        legacy_resolved boolean NOT NULL DEFAULT false,
        attempts integer NOT NULL DEFAULT 0,
        next_attempt_at timestamp NOT NULL DEFAULT now(),
        last_error text,
        updated_at timestamp NOT NULL DEFAULT now()
      );
      CREATE OR REPLACE FUNCTION "${schema}".enqueue_vakt_sheet_sync_job()
      RETURNS TRIGGER AS $$
      BEGIN
        IF TG_OP = 'INSERT' THEN
          INSERT INTO sheet_sync_jobs (vakt_id, action, payload)
          VALUES (NEW.id, 'sync', NULL);
        ELSIF TG_OP = 'UPDATE' THEN
          IF OLD.ansatt_id IS DISTINCT FROM NEW.ansatt_id OR
             OLD.barnehage_id IS DISTINCT FROM NEW.barnehage_id OR
             OLD.dato IS DISTINCT FROM NEW.dato OR
             OLD.start_tid IS DISTINCT FROM NEW.start_tid OR
             OLD.slutt_tid IS DISTINCT FROM NEW.slutt_tid OR
             OLD.vikarkode IS DISTINCT FROM NEW.vikarkode OR
             OLD.betalt_pause IS DISTINCT FROM NEW.betalt_pause OR
             OLD.avtalte_betalte_timer IS DISTINCT FROM NEW.avtalte_betalte_timer THEN
            INSERT INTO sheet_sync_jobs (vakt_id, action, payload)
            VALUES (NEW.id, 'sync', to_jsonb(OLD))
            ON CONFLICT (vakt_id) DO UPDATE SET version = sheet_sync_jobs.version + 1,
              attempts = 0, updated_at = now();
          END IF;
        ELSIF TG_OP = 'DELETE' THEN
          INSERT INTO sheet_sync_jobs (vakt_id, action, payload)
          VALUES (OLD.id, 'delete', to_jsonb(OLD))
          ON CONFLICT (vakt_id) DO UPDATE SET action = 'delete', version = sheet_sync_jobs.version + 1;
        END IF;
        IF TG_OP = 'DELETE' THEN
          RETURN OLD;
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
      CREATE TRIGGER vakter_sheet_sync_outbox
      AFTER INSERT OR UPDATE OR DELETE ON "${schema}".vakter
      FOR EACH ROW EXECUTE FUNCTION "${schema}".enqueue_vakt_sheet_sync_job();
    `);
    // Exercise the real queue policy, not a hand-maintained approximation.
    const source = readFileSync(new URL("./migrations.ts", import.meta.url), "utf8");
    const queueFunction = source.match(/CREATE OR REPLACE FUNCTION enqueue_vakt_sheet_sync_job\(\)[\s\S]*?\$\$ LANGUAGE plpgsql;/)?.[0];
    assert.ok(queueFunction, "The application's outbox trigger must be available");
    await client.query(`SET search_path TO "${schema}"`);
    await client.query(queueFunction);
    await client.query(
      `INSERT INTO "${schema}".users (id, name, external_id, role, region, user_status)
       VALUES ($1, $2, $3, 'ansatt', 'Bergen', 'Aktiv')`,
      [WEEK39_EMPLOYEE_ID, WEEK39_EMPLOYEE_NAME, WEEK39_EMPLOYEE_EXTERNAL_ID],
    );
    await client.query(
      `INSERT INTO "${schema}".barnehager (id, name, region, aktiv)
       VALUES ($1, $2, 'Bergen', true)`,
      [WEEK39_KINDERGARTEN_ID, WEEK39_KINDERGARTEN_NAME],
    );
    await client.query(
      `INSERT INTO "${schema}".users (id, name, external_id, role, region, user_status)
       VALUES ($1, $2, $3, 'ansatt', $4, 'Aktiv')`,
      [SULTAN_WEEK39.employeeId, SULTAN_WEEK39.employeeName, SULTAN_WEEK39.employeeExternalId, SULTAN_WEEK39.region],
    );
    await client.query(
      `INSERT INTO "${schema}".barnehager (id, name, region, aktiv)
       VALUES ($1, $2, $3, true)`,
      [SULTAN_WEEK39.kindergartenId, SULTAN_WEEK39.kindergartenName, SULTAN_WEEK39.region],
    );
  } finally {
    client.release();
  }
}

function dependencies(beforeCommit?: () => Promise<void>): Week39Dependencies {
  return {
    db: {
      connect: async () => {
        const client = await pool.connect();
        await client.query(`SET search_path TO "${schema}"`);
        return client;
      },
    },
    notifyUser: async (_id, _title, message) => {
      notificationCalls.push(message);
    },
    wakeSheetSyncWorker: () => undefined,
    beforeCommit,
  };
}

async function countShifts(): Promise<number> {
  const result = await pool.query(`SELECT count(*)::int AS count FROM "${schema}".vakter`);
  return result.rows[0].count;
}

test("week 39 transaction rolls back and concurrent retries reuse", {
  skip: integrationSkipReason,
}, async () => {
  try {
    await setupSchema();
    notificationCalls.length = 0;
    const deps = dependencies();
    const preview = await previewWeek39Plan("synthetic-admin", "KTV", deps);
    assert.ok(preview.confirmationToken);
    const invalid = await applyWeek39Plan("synthetic-admin", "KTV", `${preview.confirmationToken}invalid`, deps);
    assert.equal("conflicts" in invalid, true);
    assert.equal("conflicts" in await applyWeek39Plan("different-admin", "KTV", preview.confirmationToken!, deps), true);
    assert.equal("conflicts" in await applyWeek39Plan("synthetic-admin", "KTV", preview.confirmationToken!, deps, SULTAN_WEEK39), true);

    // A conflict appearing after review must prevent the entire batch.
    await pool.query(
      `INSERT INTO "${schema}".vakter (barnehage_id, dato, start_tid, slutt_tid, vikarkode, status, ansatt_id, region)
       VALUES ($1, '2026-09-23', '09:00', '16:00', 'KTV', 'tildelt', $2, 'Bergen')`,
      [WEEK39_KINDERGARTEN_ID, WEEK39_EMPLOYEE_ID],
    );
    assert.equal("conflicts" in await applyWeek39Plan("synthetic-admin", "KTV", preview.confirmationToken!, deps), true);
    assert.equal(await countShifts(), 1);
    assert.equal(notificationCalls.length, 0);
    await pool.query(`TRUNCATE "${schema}".vakter, "${schema}".sheet_sync_jobs`);

    let failed = false;
    await assert.rejects(
      applyWeek39Plan("synthetic-admin", "KTV", preview.confirmationToken!, {
        ...deps,
        beforeCommit: async () => {
          failed = true;
          throw new Error("synthetic failure before commit");
        },
      }),
      /synthetic failure/,
    );
    assert.equal(failed, true);
    assert.equal(await countShifts(), 0);
    assert.equal((await pool.query(`SELECT count(*)::int AS count FROM "${schema}".sheet_sync_jobs`)).rows[0].count, 0);

    const [first, second] = await Promise.all([
      applyWeek39Plan("synthetic-admin", "KTV", preview.confirmationToken!, deps),
      applyWeek39Plan("synthetic-admin", "KTV", preview.confirmationToken!, deps),
    ]);
    assert.equal("created" in first && "created" in second, true);
    if (!("created" in first) || !("created" in second)) return;
    assert.equal(first.created + second.created, 5);
    assert.equal(first.assigned + second.assigned, 5);
    assert.equal(first.reused + second.reused, 5);
    const reusedResult = first.reused === 5 ? first : second;
    assert.match(reusedResult.message, /allerede opprettet/);
    assert.equal(await countShifts(), 5);
    assert.equal((await pool.query(`SELECT count(*)::int AS count FROM "${schema}".sheet_sync_jobs`)).rows[0].count, 5);
    assert.equal(notificationCalls.length, 5);
    assert.match(notificationCalls[0], /2026-09-2[1-5] hos Løvstakken Barnehage \(/);
    assert.equal((await pool.query(`SELECT count(*)::int AS count FROM "${schema}".vakter WHERE timer_innsendt OR timer_godkjent`)).rows[0].count, 0);
    const persisted = (await pool.query(`SELECT dato::text, start_tid, slutt_tid, status, betalt_pause, avtalte_betalte_timer FROM "${schema}".vakter ORDER BY dato`)).rows;
    assert.deepEqual(persisted.map((r) => [r.dato, r.start_tid, r.slutt_tid]), [
      ["2026-09-21", "09:00:00", "16:30:00"],
      ["2026-09-22", "08:30:00", "16:00:00"],
      ["2026-09-23", "08:00:00", "15:30:00"],
      ["2026-09-24", "07:30:00", "15:00:00"],
      ["2026-09-25", "09:00:00", "16:30:00"],
    ]);
    assert.equal(persisted.every((r) => r.status === "tildelt" && r.betalt_pause && Number(r.avtalte_betalte_timer) === 7.5), true);
    assert.equal(persisted.reduce((sum, r) => sum + calculatePaidHours(r.start_tid, r.slutt_tid, {betaltPause:r.betalt_pause, avtalteBetalteTimer:r.avtalte_betalte_timer}), 0), 37.5);

    const jobsBefore = (await pool.query(`SELECT vakt_id, version FROM "${schema}".sheet_sync_jobs ORDER BY vakt_id`)).rows;
    await pool.query(`UPDATE "${schema}".vakter SET timer_innsendt = true, timer_godkjent = true, status = 'godkjent'`);
    assert.deepEqual((await pool.query(`SELECT vakt_id, version FROM "${schema}".sheet_sync_jobs ORDER BY vakt_id`)).rows, jobsBefore);
    await pool.query(`UPDATE "${schema}".vakter SET status='ledig', ansatt_id=NULL, timer_innsendt=false, timer_godkjent=false WHERE dato='2026-09-21'`);
    const assignResult = await applyWeek39Plan("synthetic-admin", "KTV", preview.confirmationToken!, deps);
    assert.ok("assigned" in assignResult);
    assert.equal(assignResult.assigned, 1);
    assert.equal(assignResult.created, 0);
    assert.equal(assignResult.reused, 4);
    assert.equal(notificationCalls.length, 6);

    const sultanPreview = await previewWeek39Plan("synthetic-admin", "KTV", deps, SULTAN_WEEK39);
    assert.equal(sultanPreview.totalPaidHours, 37.5);
    assert.equal(sultanPreview.betaltPause, true);
    const sultanResult = await applyWeek39Plan("synthetic-admin", "KTV", sultanPreview.confirmationToken!, deps, SULTAN_WEEK39);
    assert.ok("created" in sultanResult);
    assert.equal(sultanResult.created, 5);
    assert.equal(await countShifts(), 10);
    const sultanRows = (await pool.query(`SELECT * FROM "${schema}".vakter WHERE ansatt_id=$1`, [SULTAN_WEEK39.employeeId])).rows;
    assert.equal(sultanRows.every((r) => r.start_tid === "07:45:00" && r.slutt_tid === "15:15:00" && r.betalt_pause && !r.trekk_pause && r.avtalte_betalte_timer === null && r.status === "tildelt"), true);
    assert.equal(notificationCalls.length, 11);
    assert.equal((await pool.query(`SELECT count(*)::int AS count FROM "${schema}".sheet_sync_jobs`)).rows[0].count, 10);

    await pool.query(`ALTER TABLE "${schema}".vakter DISABLE TRIGGER vakter_sheet_sync_outbox`);
    assert.equal("conflicts" in await applyWeek39Plan("synthetic-admin", "KTV", preview.confirmationToken!, deps), true);
  } finally {
    if (schema) await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await pool.end();
  }
});