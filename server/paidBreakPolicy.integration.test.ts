import assert from "node:assert/strict";
import test from "node:test";
import { PAID_BREAK_EXEMPT_KINDERGARTEN_IDS } from "../shared/shiftHours";

// Exercise the real storage entry points with an in-memory DB adapter.
// Never connect to PostgreSQL or read a real connection string.
test("storage create and edit enforce policy without touching unrelated shift state", async (t) => {
  process.env.DATABASE_URL = "postgresql://synthetic:synthetic@127.0.0.1:1/unused";
  const { db } = await import("./db");
  const { DatabaseStorage } = await import("./storage");
  const storage = new DatabaseStorage();
  let row: any;
  t.mock.method(db, "insert", () => ({
    values: (value: any) => ({ returning: async () => { row = { id: "test-shift", ...value }; return [row]; } }),
  }));
  t.mock.method(db, "transaction", async (callback: any) => callback({
    select: () => ({ from: () => ({ where: () => ({ for: async () => [row] }) }) }),
    update: () => ({
      set: (patch: any) => ({ where: () => ({ returning: async () => { row = { ...row, ...patch }; return [row]; } }) }),
    }),
  }));
  const base = {
    dato: "2026-09-07", barnehageId: "ordinary-client", startTid: "08:00", sluttTid: "15:30",
    region: "Test", vikarkode: "TEST", status: "godkjent", betaltPause: false,
    timerInnsendt: true, timerGodkjent: true, lonnUtbetalt: true, ansattId: "test-employee",
  };
  const created = await storage.createVakt(base);
  assert.equal(created.betaltPause, true);
  assert.equal(created.trekkPause, false);
  await storage.updateVakt(row.id, { betaltPause: false, avtalteBetalteTimer: "6.25" });
  assert.equal(row.betaltPause, true);
  assert.equal(row.avtalteBetalteTimer, "6.25");
  for (const key of ["startTid", "sluttTid", "status", "ansattId", "timerInnsendt", "timerGodkjent", "lonnUtbetalt"] as const) {
    assert.equal(row[key], base[key]);
  }
  await storage.createVakt({ ...base, dato: "2026-09-06" });
  assert.equal(row.betaltPause, false);
  assert.equal(row.trekkPause, true);
  await storage.updateVakt(row.id, { dato: "2026-09-07", betaltPause: false });
  assert.equal(row.betaltPause, true);
  for (const barnehageId of PAID_BREAK_EXEMPT_KINDERGARTEN_IDS) {
    await storage.createVakt({ ...base, barnehageId });
    assert.equal(row.betaltPause, false);
    assert.equal(row.trekkPause, true);
    await storage.updateVakt(row.id, { barnehageId: "ordinary-client" });
    assert.equal(row.betaltPause, true);
    await storage.updateVakt(row.id, { barnehageId, betaltPause: false });
    assert.equal(row.betaltPause, false);
    assert.equal(row.trekkPause, true);
    await storage.updateVakt(row.id, { betaltPause: true, avtalteBetalteTimer: "7.50" });
    await storage.updateVakt(row.id, { dato: "2026-09-06" });
    assert.equal(row.betaltPause, true);
    assert.equal(row.avtalteBetalteTimer, "7.50");
    assert.equal(row.trekkPause, false);
  }
});