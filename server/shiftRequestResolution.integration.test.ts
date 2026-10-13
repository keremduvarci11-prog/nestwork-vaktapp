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
    for (const table of ["vakter", "barnehager", "vakt_interesser", "varsler"]) {
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
  } finally {
    // Only this test's temporary schema is removed; public data is untouched.
    await pool.query(`DROP SCHEMA "${namespace}" CASCADE`);
    await pool.end();
  }
});
