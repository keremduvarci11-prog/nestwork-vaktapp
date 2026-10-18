import assert from "node:assert/strict";
import test from "node:test";
import { drizzle } from "drizzle-orm/node-postgres";
import { db, pool } from "./db";
import { storage } from "./storage";

const enabled = process.env.RUN_MESSAGE_INBOX_INTEGRATION === "1" &&
  process.env.NODE_ENV === "development" &&
  !/(?:^|[./_-])prod(?:uction)?(?:[./?_-]|$)/i.test(process.env.DATABASE_URL || "");

test("shared admin inbox retrieves messages and reply flags in one query without account filtering", {
  skip: enabled ? false : "requires explicit development-only integration opt-in",
  timeout: 30_000,
}, async t => {
  const client = await pool.connect();
  const namespace = `message_inbox_test_${process.pid}_${Date.now()}`;
  try {
    await client.query("BEGIN");
    await client.query(`CREATE SCHEMA "${namespace}"`);
    for (const table of ["users", "meldinger", "samtale_meldinger"]) {
      await client.query(`CREATE TABLE "${namespace}".${table} (LIKE public.${table} INCLUDING DEFAULTS)`);
    }
    await client.query(`SET LOCAL search_path TO "${namespace}"`);
    await client.query(`INSERT INTO users (id,username,password,name,role,region,stilling,timelonn)
      VALUES ('admin-a','synthetic-admin-a','not-a-real-password','Admin A','admin','Test','Admin',0),
             ('admin-b','synthetic-admin-b','not-a-real-password','Admin B','admin','Test','Admin',0)`);
    await client.query(`INSERT INTO meldinger (id,from_user_id,to_user_id,subject,message,last_seen_by_admin)
      VALUES ('incoming','synthetic-employee','admin-b','Test','Test','2026-10-18 12:00:00'),
             ('sent','admin-a','synthetic-recipient','Test','Test',null),
             ('old-reply','admin-b','synthetic-employee','Test','Test','2026-10-18 12:00:00')`);
    await client.query(`INSERT INTO samtale_meldinger (melding_id,from_user_id,message,created_at)
      VALUES ('incoming','synthetic-employee','Test','2026-10-18 13:00:00'),
             ('sent','admin-b','Test','2026-10-18 13:00:00'),
             ('sent','admin','Test','2026-10-18 13:00:00'),
             ('old-reply','synthetic-employee','Test','2026-10-18 11:00:00')`);
    const isolated = drizzle(client);
    t.mock.method(db, "select", isolated.select.bind(isolated));
    const rows = await storage.getAdminInbox();
    assert.equal(rows.length, 3);
    assert.equal(rows.find(row => row.id === "incoming")?.hasNewReply, true);
    assert.equal(rows.find(row => row.id === "sent")?.hasNewReply, false);
    assert.equal(rows.find(row => row.id === "old-reply")?.hasNewReply, false);
    assert.equal(rows.find(row => row.id === "incoming")?.toUserId, "admin-b");
    assert.equal(rows.find(row => row.id === "sent")?.fromUserId, "admin-a");
  } finally {
    await client.query("ROLLBACK");
    client.release();
    await pool.end();
  }
});
