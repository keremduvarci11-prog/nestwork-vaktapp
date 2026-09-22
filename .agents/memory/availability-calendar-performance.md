---
name: Availability calendar performance
description: Keep the employee availability calendar mounted and optimistic during writes
---

Availability edits must update optimistically and queue per date instead of disabling or refetching the whole calendar after every click.

**Why:** A full-month invalidation plus a global pending lock made the calendar disappear and prevented employees from marking several days quickly. The UI must remain usable while individual writes are in flight.

**How to apply:** Keep read readiness separate from background fetching, overlay pending date states, serialize only repeated writes to the same date, allow different dates in parallel, update the month cache on success, and roll back only the failed date. Preserve the existing date restrictions.