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

Employees must be notified when their assigned shift times change. Applicants to a changed open shift need the new times without implying that their request has been approved.

**Why:** The user explicitly requested employee alerts for time corrections, not merely updated app and billing-sheet records.

**How to apply:** Distinguish actual time changes from no-op saves. Preserve assignment and approval status. Use ordinary app notifications and push, never a chat message or conversation as a fallback. If the automatic flow requires publishing, say so instead of sending a message. Distinguish saved app notifications from confirmed device-push delivery.

Time-change alerts must be short ordinary notifications, not messages in «Meldinger».

**Why:** The user explicitly rejected the manually sent change-time conversations and requested the same notification channel as other app alerts.

**How to apply:** For assigned shifts use «Vakten din har fått nye tider» with a prompt to tap and see the updated times. Link to the employee's shifts. Keep applicant wording distinct so it does not imply assignment. Never use the messaging endpoint for these alerts, even temporarily.