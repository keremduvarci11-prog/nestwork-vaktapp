---
name: Multiple employee regions
description: Backwards-compatible multi-region membership and the distinction between profile updates and publishing matching logic
---

Represent multiple working regions on one employee account, preserving existing text-based region interfaces rather than creating duplicate accounts or requiring a schema migration.

**Why:** Employees can work across regions, and historical profiles already contain combined place names. Treating those values as a single literal region silently excludes them from available-shift lists and regional notifications.

**How to apply:** Normalize complete region tokens and known aliases, not substrings. Keep legacy neighboring-region behavior unchanged unless explicitly asked to alter it; visibility and notification groupings historically differ. Verify both matching and notification deduplication with isolated data. A live profile update alone does not activate new matching code: distinguish saved memberships from published functionality, and never send real test notifications to prove matching.