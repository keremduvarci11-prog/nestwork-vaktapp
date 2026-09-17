---
name: Prepared shift authorization
description: Operational boundary between preparing a shift batch and performing live assignments
---

Respect any explicit in-app confirmation boundary on a prepared shift batch. A later explicit user instruction to perform registration through the ordinary administrator login supersedes that boundary for the authorized operation; do not require another manual form.

**Why:** The user explicitly authorized delegated administrator registration after an earlier plan reserved creation for manual confirmation. Authenticated app administration is not direct production SQL or an authentication bypass. Preparing code still does not prove assignment, notification delivery, or a billing row.

**How to apply:** Follow the latest authorized date and details, check targeted duplicates/conflicts, then use the app's normal protected endpoints. Keep credentials runtime-only; never bypass authentication or production SQL restrictions. Report confirmed assignments, in-app notifications, device delivery, and verified sheet rows separately. Do not generalize authorization for one operation to unrelated batches. A test with isolated data never proves live delivery.

Completed preparation cards should disappear based on server-confirmed completion, not a browser-local dismissal flag.

**Why:** The user expects a confirmed plan to stop appearing as unfinished, including after reopening the app. A local flag could hide an incomplete or failed batch and would not carry across devices.

**How to apply:** Treat only complete, conflict-free persisted assignments as finished. Keep unfinished or conflicting plans available; failed reads are not proof of completion.