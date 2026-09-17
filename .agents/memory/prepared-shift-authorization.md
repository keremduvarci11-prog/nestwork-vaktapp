---
name: Prepared shift authorization
description: Operational boundary between preparing a shift batch and performing live assignments
---

Prepare requested shift batches for the user's authenticated admin confirmation. Do not use stored admin credentials, direct production SQL, scripts, or an API bypass to perform live assignments.

**Why:** Preparing code is not evidence that an employee received a shift or that a billing row exists. The approved workflow reserves live creation for explicit in-app review and confirmation by the user.

**How to apply:** Report code readiness, publication, confirmed app assignments, notification delivery, and verified sheet rows separately. If publication or confirmation remains pending, say so and defer live read-back until it occurs. A test with isolated data or intercepted browser responses never proves live delivery.