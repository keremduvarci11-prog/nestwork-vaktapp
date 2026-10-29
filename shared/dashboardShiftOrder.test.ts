import assert from "node:assert/strict";
import test from "node:test";
import { sortDashboardShifts } from "./dashboardShiftOrder";

const shift = (id: string, barnehageId: string, startTid: string, ansattId = "a", dato = "2026-11-02") =>
  ({ id, barnehageId, startTid, ansattId, dato });

test("keeps dates chronological and groups kindergartens before start times", () => {
  const input = [
    shift("3", "b", "07:30"),
    shift("2", "a", "09:00"),
    shift("4", "a", "06:00", "a", "2026-11-03"),
    shift("1", "a", "08:00"),
  ];
  const original = [...input];
  assert.deepEqual(sortDashboardShifts(input, [{ id: "a", name: "Alfa" }, { id: "b", name: "Bjørk" }], []).map(s => s.id),
    ["1", "2", "3", "4"]);
  assert.deepEqual(input, original);
});

test("sorts equal start times by employee name and keeps same-name clients separate", () => {
  const input = [
    shift("3", "b", "07:00"),
    shift("2", "a", "08:00", "z"),
    shift("1", "a", "08:00", "a"),
  ];
  assert.deepEqual(sortDashboardShifts(input, [{ id: "a", name: "FUS" }, { id: "b", name: "FUS" }],
    [{ id: "a", name: "Anne" }, { id: "z", name: "Åse" }]).map(s => s.id), ["1", "2", "3"]);
});

test("remains grouped while client and employee data are loading", () => {
  assert.deepEqual(sortDashboardShifts([
    shift("3", "b", "07:00"), shift("2", "a", "09:00"), shift("1", "a", "08:00"),
  ], [], []).map(s => s.id), ["1", "2", "3"]);
});
