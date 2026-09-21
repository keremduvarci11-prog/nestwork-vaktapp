import assert from "node:assert/strict";
import test from "node:test";
import { db } from "./db";
import { storage } from "./storage";
import { notifyRegion } from "./notifications";
import type { User } from "@shared/schema";

test("real regional recipient flow supports both memberships without writes or push", async t => {
  const employee = {
    id: "synthetic-multi-region", username: "synthetic-only", role: "ansatt",
    region: "Stavanger/Os Øyro",
  } as User;
  const other = { ...employee, id: "synthetic-other", region: "Oslo" };
  // Intercept the database before calling the real storage membership matcher.
  t.mock.method(db, "select", () => ({
    from: () => ({ where: async () => [employee, other] }),
  }));
  const delivered: string[] = [];
  t.mock.method(storage, "getAllUsers", async () => []);
  t.mock.method(storage, "getPushSubscriptions", async () => []);
  t.mock.method(storage, "createVarsel", async (notice: { userId: string }) => {
    delivered.push(notice.userId);
    return { ...notice, id: "synthetic-notice" };
  });

  assert.deepEqual((await storage.getUsersByRegion("Os")).map(u => u.id), [employee.id]);
  assert.deepEqual((await storage.getUsersByRegions(["Stavanger"])).map(u => u.id), [employee.id]);
  assert.deepEqual(await storage.getUsersByRegions([]), []);
  for (const region of ["Os", "Stavanger", "Stavanger/Os"]) {
    delivered.length = 0;
    await notifyRegion(region, "Synthetic", "Synthetic");
    assert.deepEqual(delivered, [employee.id]);
  }
  delivered.length = 0;
  await notifyRegion("Kristiansand", "Synthetic", "Synthetic");
  assert.deepEqual(delivered, []);
  await notifyRegion("Os", "Synthetic", "Synthetic", "vakt", "/", [employee.id]);
  assert.deepEqual(delivered, []);

  // Membership plus the existing test-user list must still send only once.
  t.mock.method(storage, "getAllUsers", async () => [{
    ...employee, username: (process.env.TEST_USERNAMES || "amandafrederich").split(",")[0].trim().toLowerCase(),
  }]);
  await notifyRegion("Stavanger", "Synthetic", "Synthetic");
  assert.deepEqual(delivered, [employee.id]);
});