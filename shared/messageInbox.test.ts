import assert from "node:assert/strict";
import test from "node:test";
import { isAdminInboxUnread, type AdminInboxMessage } from "./messageInbox";

const admins = new Set(["admin-a", "admin-b"]);
const message = (patch: Partial<AdminInboxMessage>) => ({
  fromUserId: "employee", toUserId: "admin-b", read: false, closed: false, ...patch,
}) as AdminInboxMessage;

test("employee messages to either administrator belong to the shared unread count", () => {
  assert.equal(isAdminInboxUnread(message({ toUserId: "admin-a" }), admins), true);
  assert.equal(isAdminInboxUnread(message({ toUserId: "admin-b" }), admins), true);
  assert.equal(isAdminInboxUnread(message({ toUserId: null }), admins), true);
});

test("sent messages are not unread unless an employee has replied", () => {
  for (const fromUserId of ["admin-a", "admin-b", "admin"]) {
    assert.equal(isAdminInboxUnread(message({ fromUserId }), admins), false);
    assert.equal(isAdminInboxUnread(message({ fromUserId, hasNewReply: true }), admins), true);
  }
});

test("read messages and closed conversations do not produce phantom badges", () => {
  assert.equal(isAdminInboxUnread(message({ read: true }), admins), false);
  assert.equal(isAdminInboxUnread(message({ read: true, hasNewReply: true }), admins), true);
  assert.equal(isAdminInboxUnread(message({ closed: true, hasNewReply: true }), admins), false);
});
