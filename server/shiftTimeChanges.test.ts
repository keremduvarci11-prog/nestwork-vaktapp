import assert from "node:assert/strict";
import test from "node:test";
import { buildShiftTimeNotices } from "./shiftTimeChanges";

const before = {
  id: "shift", ansattId: "employee", status: "godkjent",
  dato: "2026-10-19", startTid: "08:00:00", sluttTid: "15:30:00", barnehageId: "client",
};
const after = { ...before, startTid: "08:30:00", sluttTid: "16:00:00" };

test("uses an ordinary shift notification with a short message and a link to the updated shifts", () => {
  const notices = buildShiftTimeNotices(before, after, [{ ansattId: "other" }], "Havhesten FUS");
  assert.equal(notices.length, 1);
  assert.equal(notices[0].userId, "employee");
  assert.equal(notices[0].link, "/mine-vakter");
  assert.equal(notices[0].type, "vakt");
  assert.equal(notices[0].read, false);
  assert.equal(notices[0].title, "Vakten din har fått nye tider");
  assert.match(notices[0].message, /19\. oktober 2026/);
  assert.match(notices[0].message, /Trykk her for å se de nye tidene/);
  assert.doesNotMatch(notices[0].message, /08:00|08:30/);
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
  assert.equal(notices[0].title, "Vakten du har søkt på har fått nye tider");
  assert.equal(notices[0].type, "vakt");
  assert.equal(notices[0].link, "/");
  assert.match(notices[0].message, /ikke en tildeling/);
  assert.match(notices[0].message, /ikke møte/);
  assert.deepEqual(buildShiftTimeNotices(openBefore, openAfter, [], "Client"), []);
});
