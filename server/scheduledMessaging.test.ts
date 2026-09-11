import assert from "node:assert/strict";
import test from "node:test";
import {
  isScheduledMessageDue,
  scheduledMeldingIsCancellable,
} from "./scheduledMessaging";

test("scheduled messages are not due before the requested instant", () => {
  const due = new Date("2026-09-11T05:30:00.000Z");
  assert.equal(
    isScheduledMessageDue("pending", due, new Date("2026-09-11T05:29:59.999Z")),
    false,
  );
  assert.equal(
    isScheduledMessageDue("pending", due, new Date("2026-09-11T05:30:00.000Z")),
    true,
  );
});

test("sent and cancelled rows cannot be claimed or cancelled again", () => {
  const due = new Date("2026-09-11T05:30:00.000Z");
  const now = new Date("2026-09-11T05:31:00.000Z");
  assert.equal(isScheduledMessageDue("sent", due, now), false);
  assert.equal(isScheduledMessageDue("cancelled", due, now), false);
  assert.equal(scheduledMeldingIsCancellable("pending"), true);
  assert.equal(scheduledMeldingIsCancellable("error"), true);
  assert.equal(scheduledMeldingIsCancellable("sent"), false);
  assert.equal(scheduledMeldingIsCancellable("cancelled"), false);
});
