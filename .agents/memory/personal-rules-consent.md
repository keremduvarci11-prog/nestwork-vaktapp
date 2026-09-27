---
name: Personal rules consent
description: Preserve historical employee consent and make first-login gating reliable
---

Treat each recorded acceptance as immutable evidence for that employee and rules version. Already signed employees must not be prompted to sign the same version again, and a repeated acceptance request must not change the original timestamp.

**Why:** The user relies on the original signed time in each employee's admin detail and explicitly does not want previously signed employees sent the rules again. Overwriting timestamps would corrupt that evidence.

**How to apply:** When changing onboarding or rules versions, check the persisted acceptance for the exact version before prompting. If the status cannot be fetched, show a retry state instead of treating the person as unsigned or letting an unsigned person through.