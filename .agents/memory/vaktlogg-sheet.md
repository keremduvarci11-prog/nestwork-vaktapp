---
name: Vaktlogg write policy
description: Durable rules for when shifts may write to the billing sheet and how legacy rows are identified
---

## Create once, then update the same linked row

A shift may create a billing-sheet row only once, when the shift is created. Admin changes to billing-relevant shift data, such as employee assignment, client, date, times, description, payment flag, or shift code, may update that same linked row. Approving an interested employee must replace the green available row with that employee on the same row and turn it yellow; rejecting/removing the assignment must update it back to green. Deleting a shift may remove it. Hour submission, hour approval, and status-only events must never trigger sheet synchronization.

**Why:** Re-syncing hour lifecycle events caused historical shifts to appear again as billing duplicates, while legitimate admin corrections still need to be reflected in place.

**How to apply:** New lifecycle endpoints must leave the sheet untouched unless they create a shift, delete its linked row, or explicitly edit billing-relevant row content. Updates must locate the existing row by shift ID and fail closed rather than append when identity is ambiguous.

## Row identity does not mean a fixed row number

Keep the same shift ID and full row contents, but reposition that row when its date group changes. Scope ordering to its ISO week and year; never globally sort historical/manual rows. Preserve manual formulas by leaving their cells out of value writes.

**Why:** Updating a linked row at its old address can leave an earlier date among later dates. Copying displayed values destroys formulas. Separate movement and value writes can leave retries addressing the wrong row or creating duplicates after a lost response.

**How to apply:** Plan movement against the current snapshot, and submit structural changes, app-owned values and ID together atomically. Google Sheets move destinations use pre-removal coordinates, while the subsequent value writes use final coordinates; downward moves require particular care. Re-read IDs on every retry.

## Time corrections must sync

Changing a shift's start or end time in the app must update the same Google Sheet row via shift ID. This includes early departure, illness, or other operational changes. The user reported that this currently fails in production, so verify this path explicitly when it is next fixed.

**Why:** The sheet is used for billing, and stale times require manual correction and can produce incorrect invoicing.

**How to apply:** Treat start- and end-time edits as billing-relevant updates. Confirm both the app record and the existing sheet row change without creating a second row.

## Fail-closed legacy matching

A legacy row can be claimed only when employee identity, date, start time, and end time match uniquely. Client-location labels and shift-code labels may differ between manual history and app-generated rows. Different employees must never be linked, and multiple candidates must stop without mutation.

**Why:** Historical labels are inconsistent, while employee identity and shift timing are the reliable duplicate boundary.

**How to apply:** Use this rule only to adopt one unlinked historical row during creation or to remove one uniquely linked legacy row during deletion.

## Durable delivery before acknowledgement

Every billing-relevant shift mutation must create or update a persistent sync job atomically with the database mutation. Sheet writes must be serialized across production instances, retried with a bounded backoff, and reconciled by shift ID. A missing connector or process restart may delay the row, but must not discard the work.

**Why:** The previous in-memory, fire-and-forget path acknowledged app changes before Google accepted them and permanently lost rows after connector failures or restarts. Deployment code also cannot rely on reading raw connector access tokens even when the workspace connection is valid.

**How to apply:** New write paths must rely on the database-backed outbox rather than direct or in-memory calls. Use the supported connector proxy with deployment identity, isolate development from the production sheet, and keep destructive legacy-row handling retry-safe.

## Fast operational shift orders

When the user asks to create or send shifts, treat the request as an authoritative order that the shifts are not already entered.

**Why:** The user delegates these orders to save time; a long investigative workflow removes that value.

**How to apply:** Run one targeted duplicate check for the requested employee and dates, then create immediately through the production app. Pause only for a real name/client ambiguity, an existing collision, or missing required details.

## Test shifts still need the sheet's test marking

A requested test shift must use the sheet's established orange marking and dedicated “Testvakt” field, even when the user chooses normal assignment, notifications and paid time reporting.

**Why:** The user corrected a live test shift that had only a TEST code and comment. Normal operational behavior was not permission to omit the sheet's test designation, and completing the sync queue did not establish correct visible formatting.

**How to apply:** Preserve the agreed date, hours and payment rules while applying test marking through the app's ordinary edit flow. Verify the linked sheet row's actual test label and background color, not just the application record or queue completion.