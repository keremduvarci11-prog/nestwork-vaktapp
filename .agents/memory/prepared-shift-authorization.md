---
name: Prepared shift authorization
description: Operational boundary between preparing a shift batch and performing live assignments
---

Prepare requested shift batches for the user's authenticated admin confirmation. Do not use stored admin credentials, direct production SQL, scripts, or an API bypass to perform live assignments.

**Why:** Preparing code is not evidence that an employee received a shift or that a billing row exists. The approved workflow reserves live creation for explicit in-app review and confirmation by the user.

**How to apply:** Report code readiness, publication, confirmed app assignments, notification delivery, and verified sheet rows separately. If publication or confirmation remains pending, say so and defer live read-back until it occurs. A test with isolated data or intercepted browser responses never proves live delivery.

Completed preparation cards should disappear based on server-confirmed completion, not a browser-local dismissal flag.

**Why:** The user expects a confirmed plan to stop appearing as unfinished, including after reopening the app. A local flag could hide an incomplete or failed batch and would not carry across devices.

**How to apply:** Treat only complete, conflict-free persisted assignments as finished. Keep unfinished or conflicting plans available; failed reads are not proof of completion.