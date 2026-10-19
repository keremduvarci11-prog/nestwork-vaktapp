import assert from "node:assert/strict";
import test from "node:test";
import { drizzle } from "drizzle-orm/node-postgres";
import { db, pool } from "./db";
import { storage } from "./storage";
import { LEGACY_ONBOARDING_ITEMS, NEW_EMPLOYEE_ONBOARDING_ITEMS, PAYROLL_ONBOARDING_ITEM } from "@shared/onboarding";

const enabled = process.env.RUN_ONBOARDING_INTEGRATION === "1" &&
  process.env.NODE_ENV === "development" &&
  !/(?:^|[./_-])prod(?:uction)?(?:[./?_-]|$)/i.test(process.env.DATABASE_URL || "");

test("legacy tasks stay unchanged; demonstration initialization and owned completion persist", {
  skip: enabled ? false : "requires explicit development-only integration opt-in",
}, async t => {
  const client = await pool.connect();
  const namespace = `onboarding_test_${process.pid}_${Date.now()}`;
  try {
    await client.query("BEGIN");
    await client.query(`CREATE SCHEMA "${namespace}"`);
    await client.query(`CREATE TABLE "${namespace}".onboarding (LIKE public.onboarding INCLUDING DEFAULTS)`);
    await client.query(`SET LOCAL search_path TO "${namespace}"`);
    const isolated = drizzle(client);
    t.mock.method(db, "transaction", async (callback: (tx: typeof isolated) => unknown) => callback(isolated));
    t.mock.method(db, "update", isolated.update.bind(isolated));
    const old = await storage.ensureOnboarding("legacy", LEGACY_ONBOARDING_ITEMS);
    assert.equal(old.some(row => row.item === PAYROLL_ONBOARDING_ITEM), false);
    const demo = await storage.ensureOnboarding("demo", NEW_EMPLOYEE_ONBOARDING_ITEMS);
    const payroll = demo.find(row => row.item === PAYROLL_ONBOARDING_ITEM)!;
    assert.equal(payroll.completed, false);
    assert.equal(await storage.toggleOnboarding(payroll.id, true, "another-employee"), undefined);
    const completed = await storage.toggleOnboarding(payroll.id, true, "demo");
    assert.equal(completed?.completed, true);
    const reopened = await storage.ensureOnboarding("demo", NEW_EMPLOYEE_ONBOARDING_ITEMS);
    assert.equal(reopened.length, NEW_EMPLOYEE_ONBOARDING_ITEMS.length);
    assert.equal(reopened.find(row => row.id === payroll.id)?.completed, true);
    assert.deepEqual(reopened.find(row => row.id === payroll.id)?.completedAt, completed?.completedAt);
    assert.equal((await storage.ensureOnboarding("legacy", LEGACY_ONBOARDING_ITEMS)).length, old.length);
    const undone = await storage.toggleOnboarding(payroll.id, false, "demo");
    assert.equal(undone?.completed, false);
    assert.equal(undone?.completedAt, null);
  } finally {
    await client.query("ROLLBACK");
    client.release();
    await pool.end();
  }
});
