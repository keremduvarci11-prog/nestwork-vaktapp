---
name: Native token-only authentication checks
description: Why protected reads must be tested without cookies, especially availability refreshes
---

Validate protected frontend reads with a bearer-token-only session, not just a browser session with cookies.

**Why:** Employees could successfully save availability while calendar reloads failed with 401. Cookie-only custom GET requests hid their saved state, making repeated taps submit “available” again. Ordinary browser login testing masked this native-session failure.

**How to apply:** Use the shared authenticated request path for custom reads and writes. In regressions, omit session cookies and verify the entire write → reload → next-state cycle, including blocked-date and assigned-shift reads. Failed reads must not be presented as an empty editable calendar.