---
name: Shared administrator message visibility
description: Keep admin inbox visibility consistent with existing shared server access and notifications.
---

Treat the administrator message inbox as shared across admin accounts, matching the server's existing read/reply authorization.

**Why:** The user reported receiving a notification for an employee message that vanished when opening the app, and not finding a sent message. Both messages were saved, but account-specific client filtering hid conversations associated with another admin account while new-message alerts were broadcast to admins.

**How to apply:** Keep inbox visibility and unread badges consistent across admin accounts. Preserve employee participant-only access. Never interpret an empty or failed client fetch as proof that a message was not saved. Refresh list and thread state after notifications and app return. Distinguish saved messages from best-effort device push; push latency must not make successful saves appear failed.
