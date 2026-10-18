import type { Melding } from "./schema";

export type AdminInboxMessage = Melding & { hasNewReply?: boolean };

/** All admins already have server-side access to the shared message inbox. */
export function isAdminInboxUnread(message: AdminInboxMessage, adminIds: Set<string>): boolean {
  const fromAdmin = message.fromUserId === "admin" || adminIds.has(message.fromUserId);
  return !message.closed && ((!fromAdmin && !message.read) || !!message.hasNewReply);
}
