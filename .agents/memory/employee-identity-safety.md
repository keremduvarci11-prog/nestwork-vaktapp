---
name: Employee identity safety
description: Identity collision safety and authorized account provisioning without unnecessary manual registration
---

Treat normalized email and employee number as identity collisions during account creation. Do not silently suffix those identifiers or overwrite an existing employee to satisfy a new request.

**Why:** The existing employee history was not audited for uniqueness, so introducing global unique indexes as part of one employee order risks an unrelated migration failure. Concurrent creation still needs protection, and onboarding must not survive separately from a failed account creation.

**How to apply:** Keep identity checks and account/onboarding persistence in one serialized transaction. Before extending other import or edit paths, ensure they preserve the same identity rules; creation-time checks do not retroactively clean up historical data. Audit and resolve old collisions explicitly before considering global constraints.

## Authorized account provisioning

Leave optional employee numbers blank when the user did not supply them, unless an explicit numbering rule has been agreed.

**Why:** Imported or test identifiers may lie outside the ordinary employee-number sequence. Taking the largest existing identifier and adding one can assign unintended business identifiers.

**How to apply:** Do not infer a numbering policy from the highest stored value. Missing optional identifiers must not block creation, and email/username collision checks still apply.

Do not replace an explicit request to create an employee with a form the user must fill out merely because production SQL tools are read-only. First determine whether the app's ordinary, authorized administrator interface can perform the requested operation.

**Why:** Direct database access and authenticated app administration are different capabilities. Treating the SQL limitation as a blanket inability to create accounts caused unnecessary manual work even though legitimate app administration was available.

**How to apply:** Verify the published target and existing administrator access using runtime-only secret handling, then check identity collisions before an explicitly authorized operation. Never bypass authentication or production SQL restrictions. Obtain a missing initial password through the secure secrets form rather than chat, verify the persisted account and onboarding, and distinguish successful account creation/login from delivery of credentials or an invitation.