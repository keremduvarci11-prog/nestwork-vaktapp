---
name: Vaktlogg write policy
description: Durable rules for when shifts may write to the billing sheet and how legacy rows are identified
---

## Write only at creation

A shift may write to the billing sheet only once, when the shift is created. Assignment, acceptance, editing, status changes, hour submission, and hour approval must never trigger sheet synchronization. Deleting a shift may remove its linked sheet row.

**Why:** Re-syncing later lifecycle events caused historical shifts to appear again as billing duplicates.

**How to apply:** Any new shift lifecycle endpoint must leave the sheet untouched unless it is the creation endpoint or an explicit deletion of the linked row.

## Fail-closed legacy matching

A legacy row can be claimed only when employee identity, date, start time, and end time match uniquely. Client-location labels and shift-code labels may differ between manual history and app-generated rows. Different employees must never be linked, and multiple candidates must stop without mutation.

**Why:** Historical labels are inconsistent, while employee identity and shift timing are the reliable duplicate boundary.

**How to apply:** Use this rule only to adopt one unlinked historical row during creation or to remove one uniquely linked legacy row during deletion.