---
name: Vaktlogg write policy
description: Durable rules for when shifts may write to the billing sheet and how legacy rows are identified
---

## Create once, then update in place

A shift may create a billing-sheet row only once, when the shift is created. Admin changes to billing-relevant shift data, such as employee, client, date, times, description, payment flag, or shift code, may update that same linked row. Deleting a shift may remove it. Hour submission, hour approval, and status-only events must never trigger sheet synchronization.

**Why:** Re-syncing hour lifecycle events caused historical shifts to appear again as billing duplicates, while legitimate admin corrections still need to be reflected in place.

**How to apply:** New lifecycle endpoints must leave the sheet untouched unless they create a shift, delete its linked row, or explicitly edit billing-relevant row content. Updates must locate the existing row by shift ID and fail closed rather than append when identity is ambiguous.

## Fail-closed legacy matching

A legacy row can be claimed only when employee identity, date, start time, and end time match uniquely. Client-location labels and shift-code labels may differ between manual history and app-generated rows. Different employees must never be linked, and multiple candidates must stop without mutation.

**Why:** Historical labels are inconsistent, while employee identity and shift timing are the reliable duplicate boundary.

**How to apply:** Use this rule only to adopt one unlinked historical row during creation or to remove one uniquely linked legacy row during deletion.