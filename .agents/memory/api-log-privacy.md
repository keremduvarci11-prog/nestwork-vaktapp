---
name: API log privacy
description: Why request logging must exclude API response bodies
---

Do not log API response bodies in either development or production. Route, method, status and timing are sufficient for ordinary diagnostics; use explicit, carefully redacted event logging for exceptional cases.

**Why:** An earlier response-body logger put login tokens and employee personal information into production logs. Removing future logging does not erase historical logs or invalidate tokens already issued.

**How to apply:** When adding diagnostics, never stringify authentication responses, uploaded document data or employee records. Handle any historical log cleanup or token invalidation as a separate, authorized operational action.