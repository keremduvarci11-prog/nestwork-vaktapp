---
name: Scheduled delivery guarantees
description: Deployment and activation constraints for time-sensitive in-app messages
---

Time-sensitive delivery must use an always-on deployment or an independently scheduled wake-up mechanism. Do not describe an in-process timer on Autoscale as guaranteed delivery at the requested time.

**Why:** Autoscale can sleep when no requests arrive. An empty queue or absence of errors does not prove the worker has run, and a saved draft is not an activated schedule.

**How to apply:** Distinguish code completion, publishing, confirmed production scheduling, in-app delivery, and best-effort device push. Obtain approval for deployment changes that alter running costs. Do not create production records through agent credentials or embed one-off messages in startup code; the admin must activate the schedule through the app.