import assert from "node:assert/strict";
import test from "node:test";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "@shared/schema";
import { db, pool } from "./db";
import { storage } from "./storage";
import { ShiftRequestError } from "./shiftRequestResolution";

const enabled = process.env.RUN_SHIFT_REQUEST_INTEGRATION === "1" &&
  process.env.NODE_ENV === "development" &&
  !/(?:^|[./_-])prod(?:uction)?(?:[./?_-]|$)/i.test(process.env.DATABASE_URL || "");

test("real assignment transaction stores rejection notices and serializes requests", {
  skip: enabled ? false : "requires explicit development-only integration opt-in",
  timeout: 30_000,
}, async t => {
  const namespace = `shift_request_test_${process.pid}_${Date.now()}`;
  async function query(sql: string, values: unknown[] = []) {
    const client = await pool.connect();
    try {
      await client.query(`SET search_path TO "${namespace}"`);
      return await client.query(sql, values);
    } finally {
      await client.query("RESET search_path");
      client.release();
    }
  }
  await pool.query(`CREATE SCHEMA "${namespace}"`);
  try {
    for (const table of ["vakter", "barnehager", "vakt_interesser", "varsler", "users", "availability", "blocked_dates"]) {
      await pool.query(`CREATE TABLE "${namespace}".${table} (LIKE public.${table} INCLUDING DEFAULTS)`);
    }
    t.mock.method(db, "transaction", async work => {
      const client = await pool.connect();
      try {
        await client.query(`SET search_path TO "${namespace}"`);
        return await drizzle(client, { schema }).transaction(work);
      } finally {
        await client.query("RESET search_path");
        client.release();
      }
    });
    // No real devices or employee data are ever used by these tests.
    t.mock.method(storage, "getPushSubscriptions", async () => []);
    await query("INSERT INTO barnehager (id,name,address,region) VALUES ('synthetic-bh','Testbarnehagen','Testadresse','Testregion')");
    async function reset() {
      await query("TRUNCATE vakter,vakt_interesser,varsler");
      await query(`INSERT INTO vakter (id,barnehage_id,dato,start_tid,slutt_tid,vikarkode,status,region)
        VALUES ('synthetic-shift','synthetic-bh','2026-10-13','08:15','15:45','LTV','ledig','Testregion')`);
    }
    async function request(user: string) {
      return storage.createVaktInteresse({ vaktId: "synthetic-shift", ansattId: user });
    }

    await t.test("one notice for each other requester and no repeat on acceptance or retry", async () => {
      await reset();
      await request("synthetic-winner");
      await request("synthetic-other-1");
      await request("synthetic-other-2");
      await assert.rejects(request("synthetic-other-1"), ShiftRequestError);
      await storage.updateVakt("synthetic-shift", { status: "tildelt", ansattId: "synthetic-winner" });
      const notices = await query("SELECT user_id,title,message,read FROM varsler ORDER BY user_id");
      assert.deepEqual(notices.rows.map(n => n.user_id), ["synthetic-other-1", "synthetic-other-2"]);
      assert.ok(notices.rows.every(n => !n.read && n.message.includes("Du skal ikke møte")));
      await storage.updateVakt("synthetic-shift", { status: "tildelt", ansattId: "synthetic-winner" });
      await storage.updateVakt("synthetic-shift", { status: "godkjent" });
      assert.equal((await query("SELECT * FROM varsler")).rowCount, 2);
      await assert.rejects(request("synthetic-late"), (error: unknown) =>
        error instanceof ShiftRequestError && error.status === 409);
      assert.equal((await query("SELECT * FROM vakt_interesser")).rowCount, 3);
    });

    await t.test("withdrawal removes only your requests, allows retry and reapplication", async () => {
      await reset();
      await request("synthetic-withdrawing");
      await request("synthetic-other");
      await storage.withdrawVaktInteresse("synthetic-shift", "synthetic-stranger");
      assert.equal((await query("SELECT * FROM vakt_interesser")).rowCount, 2);
      await storage.withdrawVaktInteresse("synthetic-shift", "synthetic-withdrawing");
      await storage.withdrawVaktInteresse("synthetic-shift", "synthetic-withdrawing");
      assert.deepEqual((await query("SELECT ansatt_id FROM vakt_interesser")).rows,
        [{ ansatt_id: "synthetic-other" }]);
      assert.deepEqual((await query("SELECT status,ansatt_id FROM vakter")).rows,
        [{ status: "ledig", ansatt_id: null }]);
      await request("synthetic-withdrawing");
      assert.equal((await query("SELECT * FROM vakt_interesser")).rowCount, 2);
    });

    await t.test("withdrawal after assignment cannot remove requests or cancel assignment", async () => {
      await reset();
      await request("synthetic-winner");
      await storage.updateVakt("synthetic-shift", { status: "tildelt", ansattId: "synthetic-winner" });
      await assert.rejects(storage.withdrawVaktInteresse("synthetic-shift", "synthetic-winner"),
        (error: unknown) => error instanceof ShiftRequestError && error.status === 409);
      assert.equal((await query("SELECT * FROM vakt_interesser")).rowCount, 1);
      assert.deepEqual((await query("SELECT status,ansatt_id FROM vakter")).rows,
        [{ status: "tildelt", ansatt_id: "synthetic-winner" }]);
      await assert.rejects(storage.withdrawVaktInteresse("missing-shift", "synthetic-winner"),
        (error: unknown) => error instanceof ShiftRequestError && error.status === 404);
    });

    await t.test("withdrawal racing assignment preserves the assigned employee", async () => {
      await reset();
      await request("synthetic-withdrawing");
      const [withdrawal, assignment] = await Promise.allSettled([
        storage.withdrawVaktInteresse("synthetic-shift", "synthetic-withdrawing"),
        storage.updateVakt("synthetic-shift", { status: "tildelt", ansattId: "synthetic-winner" }),
      ]);
      assert.equal(assignment.status, "fulfilled");
      assert.deepEqual((await query("SELECT status,ansatt_id FROM vakter")).rows,
        [{ status: "tildelt", ansatt_id: "synthetic-winner" }]);
      const remaining = (await query("SELECT * FROM vakt_interesser")).rowCount;
      if (withdrawal.status === "fulfilled") assert.equal(remaining, 0);
      else {
        assert.ok(withdrawal.reason instanceof ShiftRequestError && withdrawal.reason.status === 409);
        assert.equal(remaining, 1);
      }
    });

    await t.test("direct PATCH-style approval of a pending request notifies other applicants", async () => {
      await reset();
      await request("synthetic-other");
      await query("UPDATE vakter SET status='venter', ansatt_id='synthetic-winner'");
      await storage.updateVakt("synthetic-shift", { status: "godkjent" });
      assert.deepEqual((await query("SELECT user_id FROM varsler")).rows, [{ user_id: "synthetic-other" }]);
    });

    await t.test("a simultaneous request is either notified or explicitly rejected", async () => {
      await reset();
      const [application] = await Promise.allSettled([
        request("synthetic-racing"),
        storage.updateVakt("synthetic-shift", { status: "tildelt", ansattId: "synthetic-winner" }),
      ]);
      const count = (await query("SELECT * FROM varsler WHERE user_id='synthetic-racing'")).rowCount;
      if (application.status === "fulfilled") assert.equal(count, 1);
      else {
        assert.ok(application.reason instanceof ShiftRequestError);
        assert.equal(application.reason.status, 409);
        assert.equal(count, 0);
      }
    });

    await t.test("notification persistence failure rolls back assignment instead of silently dropping notices", async () => {
      await reset();
      await request("synthetic-other");
      await query("ALTER TABLE varsler ADD CONSTRAINT synthetic_notice_failure CHECK (false)");
      try {
        await assert.rejects(storage.updateVakt("synthetic-shift", { status: "tildelt", ansattId: "synthetic-winner" }));
        assert.deepEqual((await query("SELECT status,ansatt_id FROM vakter")).rows,
          [{ status: "ledig", ansatt_id: null }]);
      } finally {
        await query("ALTER TABLE varsler DROP CONSTRAINT synthetic_notice_failure");
      }
    });

    await t.test("calendar candidate is revalidated atomically before assignment", async () => {
      await reset();
      await query(`INSERT INTO users (id,username,password,name,role,region,stilling,timelonn,user_status)
        VALUES ('synthetic-calendar','synthetic-calendar','not-a-real-password','Synthetic Calendar','ansatt','Testregion','Assistent',200,'Aktiv')`);
      await query(`INSERT INTO availability (user_id,date,status)
        VALUES ('synthetic-calendar','2026-10-13','available')`);
      await storage.updateVakt("synthetic-shift", { status: "tildelt", ansattId: "synthetic-calendar" }, "synthetic-calendar");
      assert.deepEqual((await query("SELECT status,ansatt_id FROM vakter")).rows,
        [{ status: "tildelt", ansatt_id: "synthetic-calendar" }]);
      await assert.rejects(
        storage.updateVakt("synthetic-shift", { status: "tildelt", ansattId: "synthetic-calendar" }, "synthetic-calendar"),
        (error: unknown) => error instanceof ShiftRequestError && error.status === 409,
      );
      await reset();
      await query("UPDATE availability SET status='unavailable'");
      await assert.rejects(
        storage.updateVakt("synthetic-shift", { status: "tildelt", ansattId: "synthetic-calendar" }, "synthetic-calendar"),
        (error: unknown) => error instanceof ShiftRequestError && error.status === 409,
      );
      assert.deepEqual((await query("SELECT status,ansatt_id FROM vakter")).rows,
        [{ status: "ledig", ansatt_id: null }]);
    });

    await t.test("simultaneous overlapping candidate assignments cannot both succeed", async () => {
      await reset();
      await query("UPDATE availability SET status='available'");
      await query(`INSERT INTO vakter (id,barnehage_id,dato,start_tid,slutt_tid,vikarkode,status,region)
        VALUES ('synthetic-other-shift','synthetic-bh','2026-10-13','09:00','16:00','LTV','ledig','Testregion')`);
      const outcomes = await Promise.allSettled(["synthetic-shift", "synthetic-other-shift"].map(id =>
        storage.updateVakt(id, { status: "tildelt", ansattId: "synthetic-calendar" }, "synthetic-calendar")));
      assert.equal(outcomes.filter(result => result.status === "fulfilled").length, 1);
      const rejected = outcomes.find(result => result.status === "rejected") as PromiseRejectedResult;
      assert.ok(rejected.reason instanceof ShiftRequestError && rejected.reason.status === 409);
      assert.equal((await query("SELECT * FROM vakter WHERE ansatt_id='synthetic-calendar'")).rowCount, 1);
    });
  } finally {
    // Only this test's temporary schema is removed; public data is untouched.
    await pool.query(`DROP SCHEMA "${namespace}" CASCADE`);
    await pool.end();
  }
});
