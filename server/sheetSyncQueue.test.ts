import assert from "node:assert/strict";
import test from "node:test";
import type { Vakt } from "@shared/schema";
import {
  findMissingRecentVaktIds,
  sheetSyncOperationForJob,
  sheetSyncRetryDelayMs,
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