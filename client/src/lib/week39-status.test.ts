import assert from "node:assert/strict";
import test from "node:test";
import type { Week39PlanResponse } from "@shared/week39";
import { isWeek39Complete } from "./week39-status";

function plan(): Week39PlanResponse {
  return {
    employee: { id: "fixture-employee", name: "Fixture", externalId: 1 },
    kindergarten: { id: "fixture-kindergarten", name: "Fixture" },
    rows: [21, 22, 23, 24, 25].map((day) => ({
      dato: `2026-09-${day}`, startTid: "07:45", sluttTid: "15:15",
      paidHours: 7, action: "reuse", vaktId: `fixture-${day}`,
    })),
    betaltPause: false, totalPaidHours: 35, conflicts: [], confirmationToken: null,
  };
}

test("a saved plan is hidden from a fresh server preview, without local dismissal state", () => {
  assert.equal(isWeek39Complete(plan()), true);
  const paid = plan();
  paid.betaltPause = true;
  paid.totalPaidHours = 37.5;
  assert.equal(isWeek39Complete(paid), true);
});

test("missing, unassigned or conflicting shifts keep the card available", () => {
  assert.equal(isWeek39Complete(undefined), false);
  for (const action of ["create", "assign", "conflict"] as const) {
    const data = plan();
    data.rows[2].action = action;
    assert.equal(isWeek39Complete(data), false);
  }
  const data = plan();
  data.conflicts = ["Identity conflict"];
  assert.equal(isWeek39Complete(data), false);
});

test("empty, partial and duplicated previews cannot hide the card", () => {
  for (const rows of [[], plan().rows.slice(0, 4), Array(5).fill(plan().rows[0])]) {
    assert.equal(isWeek39Complete({ ...plan(), rows }), false);
  }
  const data = plan();
  delete data.rows[0].vaktId;
  assert.equal(isWeek39Complete(data), false);
  const wrongDate = plan();
  wrongDate.rows[0].dato = "2025-09-21";
  assert.equal(isWeek39Complete(wrongDate), false);
});