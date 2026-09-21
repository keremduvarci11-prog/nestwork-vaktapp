import assert from "node:assert/strict";
import test from "node:test";
import {
  WEEK39_EMPLOYEE_ID,
  WEEK39_KINDERGARTEN_ID,
  week39ConfirmSchema,
  SULTAN_WEEK39,
} from "@shared/week39";
import { evaluateWeek39Rows, type Week39Shift } from "./week39";

function shift(overrides: Partial<Week39Shift> = {}): Week39Shift {
  return {
    id: "shift",
    barnehageId: WEEK39_KINDERGARTEN_ID,
    dato: "2026-09-21",
    startTid: "09:00:00",
    sluttTid: "16:30:00",
    vikarkode: "KTV",
    status: "godkjent",
    ansattId: WEEK39_EMPLOYEE_ID,
    region: "Bergen",
    betaltPause: true,
    avtalteBetalteTimer: "7.50",
    ...overrides,
  };
}

test("week 39 evaluator creates all rows when no shifts exist", () => {
  const plan = evaluateWeek39Rows([]);
  assert.equal(plan.conflicts.length, 0);
  assert.deepEqual(plan.rows.map((row) => row.action), ["create", "create", "create", "create", "create"]);
  assert.equal(plan.rows.every((row) => row.paidHours === 7.5), true);
});

test("week 39 evaluator reuses exact assigned rows and assigns exact ledig rows", () => {
  const plan = evaluateWeek39Rows([
    shift(),
    shift({
      id: "ledig",
      dato: "2026-09-22",
      startTid: "08:30:00",
      sluttTid: "16:00:00",
      status: "ledig",
      ansattId: null,
    }),
  ], "KTV");
  assert.equal(plan.rows[0].action, "reuse");
  assert.equal(plan.rows[1].action, "assign");
  assert.equal(plan.rows[0].vaktId, "shift");
  assert.equal(plan.rows[1].vaktId, "ledig");
});

test("paid pause makes a seven-and-a-half-hour row reusable without an override", () => {
  const plan = evaluateWeek39Rows([
    shift({ avtalteBetalteTimer: null }),
  ], "KTV");
  assert.equal(plan.rows[0].action, "reuse");
});

test("week 39 evaluator fails closed on code changes and overlaps", () => {
  const codeConflict = evaluateWeek39Rows([shift({ vikarkode: "RES" })], "KTV");
  assert.equal(codeConflict.rows[0].action, "conflict");
  assert.match(codeConflict.conflicts[0], /vikarkode/);

  const overlap = evaluateWeek39Rows([
    shift({
      id: "other",
      dato: "2026-09-21",
      startTid: "10:00:00",
      sluttTid: "17:00:00",
      ansattId: null,
    }),
  ]);
  assert.equal(overlap.rows[0].action, "conflict");
  assert.match(overlap.conflicts[0], /overlappende/);
});

test("week 39 evaluator treats ambiguous identity as a plan-wide conflict", () => {
  const plan = evaluateWeek39Rows([], undefined, ["Ansattidentiteten er ikke entydig."]);
  assert.equal(plan.rows.length, 5);
  assert.equal(plan.rows.every((row) => row.action === "conflict"), true);
  assert.equal(plan.conflicts.length, 6);
});

test("confirmation payload is strict and requires explicit confirmation", () => {
  assert.equal(week39ConfirmSchema.safeParse({
    confirmationToken: "token",
    confirmed: true,
    vikarkode: "KTV",
    extra: "reject",
  }).success, false);
  assert.equal(week39ConfirmSchema.safeParse({
    confirmationToken: "token",
    confirmed: false,
    vikarkode: "KTV",
  }).success, false);
});

test("Sultan uses effective paid-break policy and the five requested times", () => {
  const plan = evaluateWeek39Rows([], "KTV", [], SULTAN_WEEK39);
  assert.equal(plan.rows.length, 5);
  assert.equal(plan.rows.every((row) => row.startTid === "07:45" && row.sluttTid === "15:15" && row.paidHours === 7.5), true);
  assert.equal(plan.rows.reduce((sum, row) => sum + row.paidHours, 0), 37.5);
});

test("unpaid terms, duplicate rows and another assignee are conflicts", () => {
  for (const existing of [
    [shift({ betaltPause: false, avtalteBetalteTimer: null })],
    [shift(), shift({ id: "duplicate" })],
    [shift({ ansattId: "other-employee" })],
    [shift({ startTid: "17:00", sluttTid: "19:00" })],
  ]) {
    assert.equal(evaluateWeek39Rows(existing).rows[0].action, "conflict");
  }
});