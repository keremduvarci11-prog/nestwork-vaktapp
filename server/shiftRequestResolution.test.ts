import assert from "node:assert/strict";
import test from "node:test";
import { buildUnsuccessfulRequestNotices, requestWasResolved } from "./shiftRequestResolution";

const open = {
  id: "synthetic-shift", status: "ledig", ansattId: null,
  barnehageId: "synthetic-kindergarten", dato: "2026-10-13",
  startTid: "08:15:00", sluttTid: "15:45:00",
};
const assigned = { ...open, status: "tildelt", ansattId: "synthetic-winner" };

test("every unsuccessful requester gets one clear notice, never the winner", () => {
  const notices = buildUnsuccessfulRequestNotices(open, assigned, [
    { ansattId: "synthetic-other-1" }, { ansattId: "synthetic-winner" },
    { ansattId: "synthetic-other-2" }, { ansattId: "synthetic-other-1" },
  ], "Testbarnehagen");
  assert.deepEqual(notices.map(n => n.userId), ["synthetic-other-1", "synthetic-other-2"]);
  for (const notice of notices) {
    assert.equal(notice.read, false);
    assert.equal(notice.link, "/");
    assert.match(notice.title, /tildelt en annen/);
    assert.match(notice.message, /Testbarnehagen.*13. oktober 2026.*08:15–15:45/);
    assert.match(notice.message, /Forespørselen din ble ikke godkjent/);
    assert.match(notice.message, /Du skal ikke møte/);
    assert.ok(!notice.message.includes("synthetic-winner"));
  }
});

test("direct approval of a pending shift also resolves other requests", () => {
  assert.equal(requestWasResolved({ ...open, status: "venter" }, { ...assigned, status: "godkjent" }), true);
  assert.equal(requestWasResolved(open, { ...assigned, status: "godkjent" }), true);
});

test("repeated assignment, winner acceptance and time edits do not repeat rejection notices", () => {
  const requests = [{ ansattId: "synthetic-other" }];
  for (const next of [assigned, { ...assigned, status: "godkjent" }, { ...assigned, startTid: "09:00" }]) {
    assert.deepEqual(buildUnsuccessfulRequestNotices(assigned, next, requests, "Test"), []);
  }
});

test("unassigned and still pending shifts send no rejection notices", () => {
  assert.equal(requestWasResolved(open, open), false);
  assert.equal(requestWasResolved(open, { ...open, status: "godkjent" }), false);
  assert.equal(requestWasResolved(open, { ...assigned, status: "venter" }), false);
  assert.deepEqual(buildUnsuccessfulRequestNotices(open, assigned, [], "Test"), []);
});
