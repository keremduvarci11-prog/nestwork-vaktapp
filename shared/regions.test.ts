import assert from "node:assert/strict";
import test from "node:test";
import {
  matchesRegions, normalizeRegionMembership, notificationRegions,
  parseRegions, visibleShiftRegions,
} from "./regions";
import { createUserRequestSchema } from "./createUser";

test("multiple memberships normalize aliases without merging place-name words", () => {
  assert.deepEqual(parseRegions(" Stavanger / Os Øyro / OS / stavanger "), ["Stavanger", "Os"]);
  assert.equal(normalizeRegionMembership("Osøyro; stavanger"), "Os/Stavanger");
  assert.deepEqual(parseRegions(" / , ; "), []);
  assert.deepEqual(parseRegions("Ukjent sted"), ["Ukjent sted"]);
});

test("either membership matches, but unrelated and partial place names do not", () => {
  for (const region of ["Stavanger/Os", "Stavanger/Os Øyro"]) {
    assert.equal(matchesRegions(region, ["Os"]), true);
    assert.equal(matchesRegions(region, ["Stavanger"]), true);
    assert.equal(matchesRegions(region, ["Bergen"]), false);
    assert.equal(matchesRegions(region, ["Oslo"]), false);
    assert.equal(matchesRegions(region, []), false);
  }
  assert.equal(matchesRegions("Os", ["Osøyro"]), true);
  assert.equal(matchesRegions("Oslo", ["Os"]), false);
});

test("shift listing unions memberships and preserves existing group behavior", () => {
  assert.deepEqual(visibleShiftRegions("Stavanger/Os Øyro"), ["Stavanger", "Os"]);
  assert.deepEqual(visibleShiftRegions("Os"), ["Os"]);
  assert.deepEqual(visibleShiftRegions("Bergen"), ["Bergen", "Os"]);
  assert.deepEqual(visibleShiftRegions("Bergen/Os"), ["Bergen", "Os"]);
  assert.deepEqual(visibleShiftRegions("Haugesund/Stord"), ["Haugesund", "Stord"]);
});

test("notification groups retain existing neighbors and match a multi-region employee once", () => {
  assert.deepEqual(notificationRegions("Os Øyro"), ["Bergen", "Os"]);
  assert.deepEqual(notificationRegions("Stavanger"), ["Stavanger"]);
  const employees = [{ id: "synthetic", region: "Stavanger/Os" }];
  for (const eventRegion of ["Os", "Stavanger", "Stavanger/Os"]) {
    const recipients = employees.filter(employee =>
      matchesRegions(employee.region, notificationRegions(eventRegion)));
    assert.equal(recipients.length, 1);
  }
  assert.equal(employees.filter(employee =>
    matchesRegions(employee.region, notificationRegions("Kristiansand"))).length, 0);
});

test("creation normalizes regions and rejects separator-only memberships", () => {
  const input = {
    name: "Synthetic Employee", email: "synthetic@example.invalid",
    stilling: "Barnehageassistent", timelonn: "200", password: "SyntheticOnly123!",
  };
  assert.equal(createUserRequestSchema.parse({ ...input, region: " Stavanger / Osøyro " }).region, "Stavanger/Os");
  assert.equal(createUserRequestSchema.safeParse({ ...input, region: " / ; " }).success, false);
});