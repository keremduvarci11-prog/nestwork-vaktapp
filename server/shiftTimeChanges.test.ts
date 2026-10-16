import assert from "node:assert/strict";
import test from "node:test";
import { buildShiftTimeNotices } from "./shiftTimeChanges";

const before = {
  id: "shift", ansattId: "employee", status: "godkjent",
  dato: "2026-10-19", startTid: "08:00:00", sluttTid: "15:30:00", barnehageId: "client",
};
const after = { ...before, startTid: "08:30:00", sluttTid: "16:00:00" };

test("notifies assigned employee with old and new time and date", () => {
  const notices = buildShiftTimeNotices(before, after, [{ ansattId: "other" }], "Havhesten FUS");
  assert.equal(notices.length, 1);
  assert.equal(notices[0].userId, "employee");
  assert.equal(notices[0].link, "/mine-vakter");
  assert.match(notices[0].message, /19\. oktober 2026/);
  assert.match(notices[0].message, /08:00–15:30.*08:30–16:00/);
});

test("ignores no-op saves, seconds formatting, and unrelated edits", () => {
  assert.deepEqual(buildShiftTimeNotices(before, before, [], "Client"), []);
  assert.deepEqual(buildShiftTimeNotices(before, { ...before, startTid: "08:00", sluttTid: "15:30" }, [], "Client"), []);
  assert.deepEqual(buildShiftTimeNotices(before, { ...before, status: "tildelt" }, [], "Client"), []);
});

test("does not send time-change notices to a newly assigned employee", () => {
  assert.deepEqual(buildShiftTimeNotices(before, { ...after, ansattId: "new" }, [], "Client"), []);
});

test("notifies interested applicants once, without implying an assignment", () => {
  const openBefore = { ...before, ansattId: null, status: "ledig" };
  const openAfter = { ...after, ansattId: null, status: "ledig" };
  const notices = buildShiftTimeNotices(openBefore, openAfter,
    [{ ansattId: "applicant" }, { ansattId: "applicant" }], "Client");
  assert.equal(notices.length, 1);
  assert.equal(notices[0].userId, "applicant");
  assert.match(notices[0].message, /ikke en tildeling/);
  assert.match(notices[0].message, /ikke møte/);
  assert.deepEqual(buildShiftTimeNotices(openBefore, openAfter, [], "Client"), []);
});
