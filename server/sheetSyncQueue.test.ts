import assert from "node:assert/strict";
import test from "node:test";
import type { Vakt } from "@shared/schema";
import {
  findMissingRecentVaktIds,
  sheetSyncOperationForJob,
  sheetSyncRetryDelayMs,
  mergeExistingRowValues,
  shouldFailClosedMissingSheetRow,
  coalescePendingSyncPayload,
  buildSheetSyncCellRequests,
} from "./sheetSync";

function makeVakt(id: string, createdAt: Date): Vakt {
  return {
    id,
    barnehageId: "barnehage",
    ansattId: null,
    dato: "2026-09-10",
    startTid: "08:00:00",
    sluttTid: "15:30:00",
    status: "ledig",
    region: "Bergen",
    beskrivelse: null,
    vikarkode: "KTV",
    betaltPause: false,
    avtalteBetalteTimer: null,
    barnehageInformert: false,
    provetime: false,
    sykIkkeMott: false,
    fakturert: false,
    lonnUtbetalt: false,
    timerInnsendt: false,
    timerInnsendtAt: null,
    timerGodkjent: false,
    timerGodkjentAt: null,
    trekkPause: true,
    createdAt,
  };
}

test("sheet sync retry delay backs off and caps at five minutes", () => {
  assert.equal(sheetSyncRetryDelayMs(0), 1_000);
  assert.equal(sheetSyncRetryDelayMs(3), 8_000);
  assert.equal(sheetSyncRetryDelayMs(20), 300_000);
});

test("recent reconciliation returns only recent shifts missing by ID", () => {
  const now = new Date("2026-09-10T12:00:00Z");
  const present = makeVakt("present", new Date("2026-09-09T10:00:00Z"));
  const missing = makeVakt("missing", new Date("2026-09-09T11:00:00Z"));
  const old = makeVakt("old", new Date("2026-08-01T10:00:00Z"));
  const rows = [
    ["Uke", "Ansatt", "", "", "", "", "", "", "", "", "", "", "", "", "", "VaktID"],
    ["37", "Ansatt", "", "", "", "", "", "", "", "", "", "", "", "", "", "present"],
  ];

  assert.deepEqual(
    findMissingRecentVaktIds([present, missing, old], rows, now),
    ["missing"],
  );
});

test("a stale sync job never deletes after its shift is gone", () => {
  assert.equal(sheetSyncOperationForJob("sync", false), "none");
  assert.equal(sheetSyncOperationForJob("sync", true), "sync");
  assert.equal(sheetSyncOperationForJob("delete", false), "delete");
});

test("an update with a missing sheet row fails closed instead of appending", () => {
  assert.equal(shouldFailClosedMissingSheetRow(-1, true), true);
  assert.equal(shouldFailClosedMissingSheetRow(-1, false), false);
  assert.equal(shouldFailClosedMissingSheetRow(4, true), false);
});

test("an insert followed by an update keeps the pending create intent", () => {
  const oldSnapshot = { id: "shift", avtalteBetalteTimer: null };
  assert.equal(coalescePendingSyncPayload(null, oldSnapshot), null);
  assert.deepEqual(
    coalescePendingSyncPayload({ id: "shift", dato: "2026-09-11" }, oldSnapshot),
    { id: "shift", dato: "2026-09-11" },
  );
});

test("paid-hours corrections preserve manual payment and invoice columns", () => {
  const previous = makeVakt("corrected", new Date("2026-09-10T11:00:00Z"));
  const current = {
    ...previous,
    betaltPause: true,
    avtalteBetalteTimer: "7.50",
  };
  const existing = [
    "37", "Synne", "Løvstakken", "Kommentar", "11.09.2026",
    "08:00", "16:00", "7", "Testvakt", "manuell faktura", "Ja", "KTV",
  ];
  const desired = [
    "37", "Synne", "Løvstakken", "Kommentar", "11.09.2026",
    "08:00", "16:00", 7.5, "", "", "Nei", "KTV",
  ];

  assert.deepEqual(
    mergeExistingRowValues(existing, desired, current, previous),
    ["37", "Synne", "Løvstakken", "Kommentar", "11.09.2026",
      "08:00", "16:00", 7.5, "Testvakt", "manuell faktura", "Ja", "KTV"],
  );
});

test("unchanged manual formula columns are absent from atomic cell writes", () => {
  const current = makeVakt("formula-safe", new Date("2026-09-10T11:00:00Z"));
  const requests = buildSheetSyncCellRequests(
    7,
    12,
    ["37", "Synne", "Løvstakken", "Kommentar", "11.09.2026", "08:00", "16:00", 7.5, "Testvakt", "rendered formula", "Ja", "KTV"],
    true,
    current,
    current,
    current.id,
  );
  assert.deepEqual(
    requests.map((request) => request.updateCells.range.startColumnIndex),
    [0, 15],
  );
  assert.equal(requests[1].updateCells.rows[0].values[0].userEnteredValue.stringValue, current.id);
});