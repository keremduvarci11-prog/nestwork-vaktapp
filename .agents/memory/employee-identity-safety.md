---
name: Employee identity safety
description: Why employee identity checks use transactional serialization instead of retroactive uniqueness migrations
---

Treat normalized email and employee number as identity collisions during account creation. Do not silently suffix those identifiers or overwrite an existing employee to satisfy a new request.

**Why:** The existing employee history was not audited for uniqueness, so introducing global unique indexes as part of one employee order risks an unrelated migration failure. Concurrent creation still needs protection, and onboarding must not survive separately from a failed account creation.

**How to apply:** Keep identity checks and account/onboarding persistence in one serialized transaction. Before extending other import or edit paths, ensure they preserve the same identity rules; creation-time checks do not retroactively clean up historical data. Audit and resolve old collisions explicitly before considering global constraints.