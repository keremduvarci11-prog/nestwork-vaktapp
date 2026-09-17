// Synkroniserer vakter til admins eget Google Sheets-dokument ("vaktloggen")
// Appen er fasit — arket fylles og oppdateres automatisk, rad for rad.
// Kolonner: A=Uke, B=Ansatt, C=Kunde/Barnehage, D=Kommentar, E=Dato,
//           F=Fra kl, G=Til kl, H=Timer, I=Timelønn, J=Fakturert?,
//           K=Har vi betalt?, L=Faktura markeres med (kode)
//           P=VaktID (skjult teknisk kolonne som kobler rad til vakt i appen)
import { getUncachableGoogleSheetClient } from "./googleSheets";
import { storage } from "./storage";
import { pool } from "./db";
import type { Vakt, User, Barnehage } from "@shared/schema";
import { calculatePaidHours } from "@shared/shiftHours";
import { findLegacyRowMatch } from "./sheetRowMatching";
import {
  planSheetPlacement,
  sheetPlacementRequest,
} from "./sheetOrder";

// Produksjon og utvikling må aldri dele arkmål ved et uhell.
const SPREADSHEET_ID =
  process.env.NODE_ENV === "production"
    ? process.env.VAKT_SHEET_ID || ""
    : process.env.DEV_VAKT_SHEET_ID || "";
const SHEET_NAME = "Sheet1";
const ID_COL_INDEX = 15; // kolonne P (0-basert)
const READ_RANGE = `${SHEET_NAME}!A:P`; // hele arket, uansett lengde

// Farger fra arket
const COLORS = {
  yellow: { red: 1, green: 1, blue: 0 }, // aktiv/bekreftet vakt
  green: { red: 0x2e / 255, green: 0x7d / 255, blue: 0x32 / 255 }, // ledig / ikke bekreftet / ikke informert
  red: { red: 1, green: 0, blue: 0 }, // syk / møtte ikke
  orange: { red: 1, green: 0.6, blue: 0 }, // prøvetime
  white: { red: 1, green: 1, blue: 1 }, // fullført
  black: { red: 0, green: 0, blue: 0 },
  textWhite: { red: 1, green: 1, blue: 1 },
};

function isoWeek(dateStr: string): number {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

function formatDato(iso: string): string {
  if (!iso || !iso.includes("-")) return iso || "";
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}

function formatTid(t: string | null): string {
  if (!t) return "-";
  return t.split(":").slice(0, 2).join(":");
}

function beregnTimer(vakt: Vakt): number {
  const timer = calculatePaidHours(
    vakt.startTid || "",
    vakt.sluttTid || "",
    vakt,
  );
  return Math.round(timer * 100) / 100;
}

function fornavn(name: string): string {
  return (name || "").trim().split(/\s+/)[0] || "";
}

type RowStyle = { bg: any; fg: any };

function rowStyle(vakt: Vakt): RowStyle {
  if (vakt.sykIkkeMott) return { bg: COLORS.red, fg: COLORS.black };
  if (vakt.provetime) return { bg: COLORS.orange, fg: COLORS.black };
  if (vakt.timerGodkjent) return { bg: COLORS.white, fg: COLORS.black }; // fullført
  if (vakt.ansattId) return { bg: COLORS.yellow, fg: COLORS.black }; // tildelt en ansatt
  return { bg: COLORS.green, fg: COLORS.textWhite }; // ledig / lagt ut uten tildeling
}

function buildRowValues(vakt: Vakt, ansatt: User | null, barnehage: Barnehage | null): (string | number)[] {
  const uke = isoWeek(vakt.dato);
  const ansattLabel = ansatt
    ? `${ansatt.externalId ? ansatt.externalId + " " : ""}${fornavn(ansatt.name)}`.trim()
    : "---------";
  return [
    uke,
    ansattLabel,
    barnehage?.name || "",
    vakt.beskrivelse || "",
    formatDato(vakt.dato),
    formatTid(vakt.startTid),
    formatTid(vakt.sluttTid),
    beregnTimer(vakt),
    vakt.provetime ? "Testvakt" : "", // I: merk prøvetime; ellers tom
    "", // J: står tom
    vakt.lonnUtbetalt ? "Ja" : "Nei", // K
    vakt.vikarkode || "", // L: kode
  ];
}

async function getSheetGridInfo(
  sheets: any,
): Promise<{ sheetId: number; rowCount?: number }> {
  const meta = await sheets.spreadsheets.get({
    spreadsheetId: SPREADSHEET_ID,
    fields: "sheets.properties",
  });
  const sheet = meta.data.sheets?.find((s: any) => s.properties?.title === SHEET_NAME);
  if (!sheet || !Number.isInteger(sheet.properties?.sheetId)) {
    throw new Error(`[SheetSync] Fant ikke arket ${SHEET_NAME}; ingen rader ble endret`);
  }
  return {
    sheetId: sheet.properties.sheetId,
    rowCount: sheet?.properties?.gridProperties?.rowCount,
  };
}

async function getSheetGridId(sheets: any): Promise<number> {
  return (await getSheetGridInfo(sheets)).sheetId;
}

function cellFormatRequests(
  gridId: number,
  rowIdx: number,
  vakt: Vakt,
  preserveManualFormatting = false,
): any[] {
  const style = rowStyle(vakt);
  const requests: any[] = [
    // A–H: radfarge etter status (Uke t.o.m. Timer)
    {
      repeatCell: {
        range: { sheetId: gridId, startRowIndex: rowIdx, endRowIndex: rowIdx + 1, startColumnIndex: 0, endColumnIndex: 8 },
        cell: {
          userEnteredFormat: {
            backgroundColor: style.bg,
            textFormat: { foregroundColor: style.fg },
          },
        },
        fields: "userEnteredFormat.backgroundColor,userEnteredFormat.textFormat.foregroundColor",
      },
    },
    ...(preserveManualFormatting
      ? []
      : // I–J og M–P: nøytral formatering (hvit bakgrunn, svart tekst)
        [[8, 10], [12, 16]].map(([start, end]) => ({
          repeatCell: {
            range: { sheetId: gridId, startRowIndex: rowIdx, endRowIndex: rowIdx + 1, startColumnIndex: start, endColumnIndex: end },
            cell: {
              userEnteredFormat: {
                backgroundColor: COLORS.white,
                textFormat: { foregroundColor: COLORS.black },
              },
            },
            fields: "userEnteredFormat.backgroundColor,userEnteredFormat.textFormat.foregroundColor",
          },
        }))),
    // K (Har vi betalt?): rød med hvit tekst når "Nei"
    {
      repeatCell: {
        range: { sheetId: gridId, startRowIndex: rowIdx, endRowIndex: rowIdx + 1, startColumnIndex: 10, endColumnIndex: 11 },
        cell: {
          userEnteredFormat: vakt.lonnUtbetalt
            ? { backgroundColor: COLORS.white, textFormat: { foregroundColor: COLORS.black } }
            : { backgroundColor: COLORS.red, textFormat: { foregroundColor: COLORS.textWhite } },
        },
        fields: "userEnteredFormat.backgroundColor,userEnteredFormat.textFormat.foregroundColor",
      },
    },
    // L (Kode): alltid gul med svart skrift
    {
      repeatCell: {
        range: { sheetId: gridId, startRowIndex: rowIdx, endRowIndex: rowIdx + 1, startColumnIndex: 11, endColumnIndex: 12 },
        cell: {
          userEnteredFormat: {
            backgroundColor: COLORS.yellow,
            textFormat: { foregroundColor: COLORS.black },
          },
        },
        fields: "userEnteredFormat.backgroundColor,userEnteredFormat.textFormat.foregroundColor",
      },
    },
  ];
  // Kantlinjer: rundt A–H og K–L, ingen mellom de tomme feltene I–J
  const solid = { style: "SOLID", color: COLORS.black };
  const none = { style: "NONE" };
  const borderRange = (start: number, end: number) => ({
    sheetId: gridId, startRowIndex: rowIdx, endRowIndex: rowIdx + 1, startColumnIndex: start, endColumnIndex: end,
  });
  requests.push({
    updateBorders: {
      range: borderRange(0, 8),
      top: solid,
      bottom: solid,
      left: solid,
      right: solid,
      innerVertical: solid,
    },
  });
  if (!preserveManualFormatting) {
    requests.push({
      updateBorders: { range: borderRange(8, 10), top: none, bottom: none, innerVertical: none },
    });
  }
  requests.push({
    updateBorders: {
      range: borderRange(10, 12),
      top: solid,
      bottom: solid,
      left: solid,
      right: solid,
      innerVertical: solid,
    },
  });
  return requests;
}

function enteredValue(value: string | number): Record<string, string | number> {
  return typeof value === "number" ? { numberValue: value } : { stringValue: value };
}

function cellValueRequest(
  gridId: number,
  rowIdx: number,
  startColumnIndex: number,
  values: readonly (string | number)[],
): any {
  return {
    updateCells: {
      range: {
        sheetId: gridId,
        startRowIndex: rowIdx,
        endRowIndex: rowIdx + 1,
        startColumnIndex,
        endColumnIndex: startColumnIndex + values.length,
      },
      rows: [{ values: values.map((value) => ({ userEnteredValue: enteredValue(value) })) }],
      fields: "userEnteredValue",
    },
  };
}

/**
 * Produces only the cell writes needed for a sync.  Kept separate from the
 * Sheets client so request construction can be tested with a mock and so
 * unchanged manual/formula columns are visibly absent from the request.
 */
export function buildSheetSyncCellRequests(
  gridId: number,
  rowIdx: number,
  valuesToWrite: readonly (string | number)[],
  existingRow: boolean,
  current: Pick<Vakt, "provetime" | "lonnUtbetalt" | "vikarkode">,
  previous: Pick<Vakt, "provetime" | "lonnUtbetalt" | "vikarkode"> | undefined,
  vaktId: string,
): any[] {
  const requests: any[] = [];
  if (existingRow) {
    requests.push(cellValueRequest(gridId, rowIdx, 0, valuesToWrite.slice(0, 8)));
    if (!previous || previous.provetime !== current.provetime) {
      requests.push(cellValueRequest(gridId, rowIdx, 8, [valuesToWrite[8]]));
    }
    if (!previous || previous.lonnUtbetalt !== current.lonnUtbetalt) {
      requests.push(cellValueRequest(gridId, rowIdx, 10, [valuesToWrite[10]]));
    }
    if (!previous || previous.vikarkode !== current.vikarkode) {
      requests.push(cellValueRequest(gridId, rowIdx, 11, [valuesToWrite[11]]));
    }
  } else {
    requests.push(cellValueRequest(gridId, rowIdx, 0, valuesToWrite));
  }
  requests.push(cellValueRequest(gridId, rowIdx, ID_COL_INDEX, [vaktId]));
  return requests;
}

type SheetSyncAction = "sync" | "delete";

type SheetSyncJob = {
  vakt_id: string;
  action: SheetSyncAction;
  payload: Vakt | null;
  generation: string;
  legacy_resolved: boolean;
  attempts: number;
};

const WORKER_INTERVAL_MS = 30_000;
const RECONCILE_INTERVAL_MS = 10 * 60_000;
const RECENT_RECONCILE_DAYS = 14;
const JOB_LEASE_MINUTES = 10;
const SHEET_WRITER_LOCK_KEY = 1_573_291_370;

let workerPromise: Promise<void> | null = null;
let reconciliationPromise: Promise<void> | null = null;
let workerStarted = false;

function sheetSyncRuntimeEnabled(): boolean {
  if (process.env.NODE_ENV === "production") return true;
  return (
    process.env.ENABLE_DEV_SHEET_SYNC === "true" &&
    Boolean(process.env.DEV_VAKT_SHEET_ID)
  );
}

export function sheetSyncRetryDelayMs(attempts: number): number {
  return Math.min(5 * 60_000, 1_000 * 2 ** Math.min(Math.max(attempts, 0), 9));
}

export function sheetSyncOperationForJob(
  action: SheetSyncAction,
  shiftExists: boolean,
): "sync" | "delete" | "none" {
  if (action === "delete") return "delete";
  return shiftExists ? "sync" : "none";
}

export function shouldFailClosedMissingSheetRow(
  rowIndex: number,
  hasPreviousSnapshot: boolean,
): boolean {
  return rowIndex === -1 && hasPreviousSnapshot;
}

/**
 * An INSERT outbox job intentionally has a NULL payload: it means the shift
 * did not have an older row snapshot and may append its first sheet row. If an
 * UPDATE arrives before that job is processed, keep that NULL intent instead
 * of replacing it with the UPDATE's OLD snapshot. Once a job has a snapshot,
 * the oldest snapshot remains the one needed for legacy-row matching and
 * fail-closed updates.
 */
export function coalescePendingSyncPayload<T>(
  existingPayload: T | null,
  incomingPayload: T | null,
): T | null {
  return existingPayload === null ? null : existingPayload ?? incomingPayload;
}

export function findMissingRecentVaktIds(
  allVakter: Vakt[],
  rows: string[][],
  now: Date,
  lookbackDays = RECENT_RECONCILE_DAYS,
): string[] {
  const cutoff = now.getTime() - lookbackDays * 24 * 60 * 60_000;
  const sheetIds = new Set(
    rows.map((row) => String(row[ID_COL_INDEX] || "").trim()).filter(Boolean),
  );

  return allVakter
    .filter((vakt) => {
      if (!vakt.createdAt) return false;
      return new Date(vakt.createdAt).getTime() >= cutoff;
    })
    .filter((vakt) => !sheetIds.has(vakt.id))
    .map((vakt) => vakt.id);
}

async function persistJob(
  action: SheetSyncAction,
  vaktId: string,
  payload?: Vakt,
  onlyIfMissing = false,
): Promise<void> {
  if (onlyIfMissing) {
    await pool.query(
      `INSERT INTO sheet_sync_jobs (vakt_id, action, payload)
       VALUES ($1, $2, $3::jsonb)
       ON CONFLICT (vakt_id) DO NOTHING`,
      [vaktId, action, payload ? JSON.stringify(payload) : null],
    );
    return;
  }

  await pool.query(
    `INSERT INTO sheet_sync_jobs (vakt_id, action, payload)
     VALUES ($1, $2, $3::jsonb)
     ON CONFLICT (vakt_id) DO UPDATE SET
       action = EXCLUDED.action,
       payload = CASE
         WHEN sheet_sync_jobs.action = 'sync' AND EXCLUDED.action = 'sync'
            THEN CASE
              WHEN sheet_sync_jobs.payload IS NULL THEN NULL
              ELSE sheet_sync_jobs.payload
            END
         ELSE EXCLUDED.payload
       END,
       version = sheet_sync_jobs.version + 1,
       generation = gen_random_uuid(),
       legacy_resolved = CASE
         WHEN sheet_sync_jobs.action = 'delete' AND EXCLUDED.action = 'delete'
           THEN sheet_sync_jobs.legacy_resolved
         ELSE false
       END,
       attempts = 0,
       next_attempt_at = GREATEST(sheet_sync_jobs.next_attempt_at, now()),
       last_error = NULL,
       updated_at = now()`,
    [vaktId, action, payload ? JSON.stringify(payload) : null],
  );
}

async function claimNextJob(): Promise<SheetSyncJob | null> {
  const result = await pool.query<SheetSyncJob & { payload: Record<string, unknown> | null }>(
    `WITH next_job AS (
       SELECT vakt_id
       FROM sheet_sync_jobs
       WHERE next_attempt_at <= now()
       ORDER BY next_attempt_at, updated_at
       LIMIT 1
       FOR UPDATE SKIP LOCKED
     )
     UPDATE sheet_sync_jobs AS job
     SET next_attempt_at = now() + ($1 * interval '1 minute')
     FROM next_job
     WHERE job.vakt_id = next_job.vakt_id
     RETURNING job.vakt_id, job.action, job.payload,
               job.generation::text, job.legacy_resolved, job.attempts`,
    [JOB_LEASE_MINUTES],
  );
  const job = result.rows[0];
  if (!job) return null;
  return { ...job, payload: normalizeVaktPayload(job.payload) };
}

function normalizeVaktPayload(payload: Record<string, any> | null): Vakt | null {
  if (!payload) return null;
  return {
    ...payload,
    barnehageId: payload.barnehageId ?? payload.barnehage_id,
    ansattId: payload.ansattId ?? payload.ansatt_id,
    startTid: payload.startTid ?? payload.start_tid,
    sluttTid: payload.sluttTid ?? payload.slutt_tid,
    trekkPause: payload.trekkPause ?? payload.trekk_pause,
    betaltPause: payload.betaltPause ?? payload.betalt_pause ?? false,
    avtalteBetalteTimer: payload.avtalteBetalteTimer ?? payload.avtalte_betalte_timer ?? null,
    timerInnsendt: payload.timerInnsendt ?? payload.timer_innsendt,
    timerInnsendtAt: payload.timerInnsendtAt ?? payload.timer_innsendt_at,
    timerGodkjent: payload.timerGodkjent ?? payload.timer_godkjent,
    timerGodkjentAt: payload.timerGodkjentAt ?? payload.timer_godkjent_at,
    barnehageInformert: payload.barnehageInformert ?? payload.barnehage_informert,
    sykIkkeMott: payload.sykIkkeMott ?? payload.syk_ikke_mott,
    lonnUtbetalt: payload.lonnUtbetalt ?? payload.lonn_utbetalt,
    provetime: payload.provetime,
    fakturert: payload.fakturert,
    createdAt: payload.createdAt ?? payload.created_at,
  } as Vakt;
}

async function completeJob(job: SheetSyncJob): Promise<void> {
  await pool.query(
    "DELETE FROM sheet_sync_jobs WHERE vakt_id = $1 AND generation = $2::uuid",
    [job.vakt_id, job.generation],
  );
}

async function retryJob(job: SheetSyncJob, error: unknown): Promise<void> {
  const message = error instanceof Error ? error.message : String(error);
  const delayMs = sheetSyncRetryDelayMs(job.attempts);
  await pool.query(
    `UPDATE sheet_sync_jobs
     SET attempts = attempts + 1,
         next_attempt_at = now() + ($3 * interval '1 millisecond'),
         last_error = $4,
         updated_at = now()
     WHERE vakt_id = $1 AND generation = $2::uuid`,
    [job.vakt_id, job.generation, delayMs, message.slice(0, 2000)],
  );
  console.error(
    `[SheetSync] ${job.action} feilet for ${job.vakt_id}; prøver igjen om ${Math.round(delayMs / 1000)}s: ${message}`,
  );
}

async function processJob(job: SheetSyncJob): Promise<void> {
  if (sheetSyncOperationForJob(job.action, true) === "delete") {
    const deletedVakt = job.payload ?? undefined;
    const ansatt = deletedVakt?.ansattId
      ? await storage.getUser(deletedVakt.ansattId)
      : null;
    const barnehage = deletedVakt
      ? await storage.getBarnehage(deletedVakt.barnehageId)
      : null;
    await doRemove(
      job.vakt_id,
      deletedVakt
        ? buildRowValues(deletedVakt, ansatt ?? null, barnehage ?? null)
        : undefined,
      job.legacy_resolved,
      async () => {
        await pool.query(
          `UPDATE sheet_sync_jobs
           SET legacy_resolved = true, updated_at = now()
           WHERE vakt_id = $1 AND generation = $2::uuid`,
          [job.vakt_id, job.generation],
        );
      },
    );
    return;
  }

  const vakt = await storage.getVakt(job.vakt_id);
  if (sheetSyncOperationForJob(job.action, Boolean(vakt)) === "none") return;
  if (!vakt) return;
  const ansatt = vakt.ansattId ? await storage.getUser(vakt.ansattId) : null;
  const barnehage = await storage.getBarnehage(vakt.barnehageId);
  const previousVakt = job.payload ?? undefined;
  const previousAnsatt = previousVakt?.ansattId
    ? await storage.getUser(previousVakt.ansattId)
    : null;
  const previousBarnehage = previousVakt
    ? await storage.getBarnehage(previousVakt.barnehageId)
    : null;

  await doSync(
    vakt,
    ansatt ?? null,
    barnehage ?? null,
    previousVakt
      ? {
          vakt: previousVakt,
          ansatt: previousAnsatt ?? null,
          barnehage: previousBarnehage ?? null,
        }
      : undefined,
  );
}

async function withSheetWriterLock<T>(work: () => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("SELECT pg_advisory_lock($1)", [SHEET_WRITER_LOCK_KEY]);
    return await work();
  } finally {
    try {
      await client.query("SELECT pg_advisory_unlock($1)", [SHEET_WRITER_LOCK_KEY]);
    } finally {
      client.release();
    }
  }
}

async function drainDueJobs(): Promise<void> {
  while (true) {
    const processed = await withSheetWriterLock(async () => {
      const job = await claimNextJob();
      if (!job) return false;
      try {
        await processJob(job);
        await completeJob(job);
      } catch (error) {
        await retryJob(job, error);
      }
      return true;
    });
    if (!processed) return;
  }
}

function kickWorker(): void {
  if (workerPromise) return;
  workerPromise = drainDueJobs()
    .catch((error) => console.error("[SheetSync] Arbeiderfeil:", error))
    .finally(() => {
      workerPromise = null;
    });
}

export function wakeSheetSyncWorker(): void {
  if (!sheetSyncRuntimeEnabled()) return;
  kickWorker();
}

export async function queueVaktSync(vaktId: string, previousVakt?: Vakt): Promise<void> {
  await persistJob("sync", vaktId, previousVakt);
  kickWorker();
}

export async function removeVaktRowFromSheet(
  vaktId: string,
  deletedVakt?: Vakt,
): Promise<void> {
  await persistJob("delete", vaktId, deletedVakt);
  kickWorker();
}

export async function reconcileRecentVakterToSheet(): Promise<void> {
  if (reconciliationPromise) return reconciliationPromise;
  reconciliationPromise = (async () => {
    const sheets = await getUncachableGoogleSheetClient();
    const [sheetResult, allVakter] = await Promise.all([
      sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: READ_RANGE,
      }),
      storage.getVakter(),
    ]);
    const rows: string[][] = sheetResult.data.values || [];
    const missingIds = findMissingRecentVaktIds(allVakter, rows, new Date());
    for (const vaktId of missingIds) {
      await persistJob("sync", vaktId, undefined, true);
    }
    if (missingIds.length) {
      console.warn(
        `[SheetSync] Kontroll fant ${missingIds.length} nylige vakter uten arkrad`,
      );
      kickWorker();
    }
  })()
    .catch((error) =>
      console.error("[SheetSync] Kontroll av nylige vakter feilet:", error),
    )
    .finally(() => {
      reconciliationPromise = null;
    });
  return reconciliationPromise;
}

export function startSheetSyncWorker(): void {
  if (workerStarted) return;
  workerStarted = true;
  if (!sheetSyncRuntimeEnabled()) {
    console.log(
      "[SheetSync] Utviklingssynk er deaktivert; sett ENABLE_DEV_SHEET_SYNC=true med eget DEV_VAKT_SHEET_ID for testark",
    );
    return;
  }
  if (!SPREADSHEET_ID) {
    throw new Error("[SheetSync] VAKT_SHEET_ID mangler i produksjonsmiljøet");
  }
  kickWorker();
  if (process.env.NODE_ENV === "production") {
    void reconcileRecentVakterToSheet();
  }
  const workerTimer = setInterval(kickWorker, WORKER_INTERVAL_MS);
  const reconcileTimer =
    process.env.NODE_ENV === "production"
      ? setInterval(
          () => void reconcileRecentVakterToSheet(),
          RECONCILE_INTERVAL_MS,
        )
      : null;
  workerTimer.unref();
  reconcileTimer?.unref();
  console.log("[SheetSync] Varig synkarbeider startet");
}

async function doSync(
  vakt: Vakt,
  ansatt: User | null,
  barnehage: Barnehage | null,
  previous?: { vakt: Vakt; ansatt: User | null; barnehage: Barnehage | null },
): Promise<void> {
  const sheets = await getUncachableGoogleSheetClient();
  const gridInfo = await getSheetGridInfo(sheets);
  const gridId = gridInfo.sheetId;

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: READ_RANGE,
  });
  const rows: string[][] = res.data.values || [];

  const values = buildRowValues(vakt, ansatt, barnehage);

  // Finn eksisterende rad for denne vakten (kolonne P). Trimming makes a
  // retry safe even when Sheets has returned a technically formatted ID.
  let rowIdx = rows.findIndex(
    (r) => String(r[ID_COL_INDEX] ?? "").trim() === vakt.id,
  );
  let existingRow = rowIdx !== -1;

  if (rowIdx === -1) {
    const legacyMatch = findLegacyRowMatch(
      rows,
      previous
        ? [values, buildRowValues(previous.vakt, previous.ansatt, previous.barnehage)]
        : [values],
    );
    if (legacyMatch.kind === "ambiguous") {
      const rowNumbers = legacyMatch.rowIndexes.map((index) => index + 1).join(", ");
      throw new Error(
        `Tvetydige historiske rader (${rowNumbers}) for vakt ${vakt.id}; ingen ny rad ble opprettet`,
      );
    }
    if (legacyMatch.kind === "match") {
      rowIdx = legacyMatch.rowIndex;
      existingRow = true;
      console.log(
        `[SheetSync] Overtar historisk rad ${rowIdx + 1} for vakt ${vakt.id}`,
      );
    }
  }

  // An update with a previous snapshot is expected to target an existing row.
  // Never append a duplicate when that row disappeared in the sheet.
  if (rowIdx === -1 && shouldFailClosedMissingSheetRow(rowIdx, Boolean(previous))) {
    throw new Error(
      `Mangler eksisterende arkrad for vakt ${vakt.id}; ingen ny rad ble opprettet`,
    );
  }

  const placement = planSheetPlacement(rows, vakt.dato, rowIdx, {
    gridRowCount: gridInfo.rowCount,
  });
  if (placement.kind === "error") {
    throw new Error(
      `Kunne ikke plassere vakt ${vakt.id} i vaktloggen: ${placement.reason}`,
    );
  }
  const sourceRowIdx = rowIdx;
  rowIdx = placement.finalRowIndex;
  const existingValues = existingRow ? rows[sourceRowIdx] : undefined;
  const valuesToWrite = existingValues
    ? mergeExistingRowValues(existingValues, values, vakt, previous?.vakt)
    : values;

  // Structural movement, values, ID, and formatting are deliberately sent as
  // one Sheets batch. If the response is lost, the next attempt sees the ID
  // in its new row and performs an idempotent update rather than inserting a
  // duplicate. Existing manual columns are addressed selectively so formulas
  // are never rewritten as rendered values.
  const requests: any[] = [];
  const structuralRequest = sheetPlacementRequest(placement, gridId);
  if (Array.isArray(structuralRequest)) {
    requests.push(...structuralRequest);
  } else if (structuralRequest) {
    requests.push(structuralRequest);
  }
  requests.push(
    ...buildSheetSyncCellRequests(
      gridId,
      rowIdx,
      valuesToWrite,
      existingRow,
      vakt,
      previous?.vakt,
      vakt.id,
    ),
  );
  requests.push(...cellFormatRequests(gridId, rowIdx, vakt, existingRow));
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SPREADSHEET_ID,
    requestBody: { requests },
  });
  console.log(
    `[SheetSync] Rad ${rowIdx + 1} synket for vakt ${vakt.id} (${values[1]} ${values[4]})`,
  );
}

/**
 * Keep manually maintained payment/invoice columns intact when a correction
 * only changes paid-hours inputs. Columns I/J/K/L are selectively updated
 * when their corresponding app field changed; J is always sheet-owned.
 */
export function mergeExistingRowValues(
  existing: readonly unknown[],
  desired: readonly (string | number)[],
  current: Vakt,
  previous?: Vakt,
): (string | number)[] {
  const merged: (string | number)[] = Array.from({ length: 12 }, (_, index) => {
    const value = existing[index];
    return value === null || value === undefined ? "" : String(value);
  });
  for (let index = 0; index < 8; index++) {
    merged[index] = desired[index] ?? "";
  }

  const changed = <K extends keyof Vakt>(field: K): boolean =>
    !previous || previous[field] !== current[field];
  if (changed("provetime")) merged[8] = desired[8] ?? "";
  if (changed("lonnUtbetalt")) merged[10] = desired[10] ?? "";
  if (changed("vikarkode")) merged[11] = desired[11] ?? "";
  return merged;
}

async function doRemove(
  vaktId: string,
  deletedValues?: (string | number)[],
  legacyResolved = false,
  markResolved?: () => Promise<void>,
): Promise<void> {
  const sheets = await getUncachableGoogleSheetClient();
  const gridId = await getSheetGridId(sheets);
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: READ_RANGE,
  });
  const rows: string[][] = res.data.values || [];
  let rowIdx = rows.findIndex((r) => r[ID_COL_INDEX] === vaktId);
  if (rowIdx === -1 && legacyResolved) return;
  if (rowIdx === -1 && deletedValues) {
    const legacyMatch = findLegacyRowMatch(rows, [deletedValues]);
    if (legacyMatch.kind === "ambiguous") {
      const rowNumbers = legacyMatch.rowIndexes.map((index) => index + 1).join(", ");
      throw new Error(
        `Tvetydige historiske rader (${rowNumbers}) ved sletting av vakt ${vaktId}; ingen rad ble slettet`,
      );
    }
    if (legacyMatch.kind === "match") {
      rowIdx = legacyMatch.rowIndex;
      await sheets.spreadsheets.values.batchUpdate({
        spreadsheetId: SPREADSHEET_ID,
        requestBody: {
          valueInputOption: "RAW",
          data: [
            { range: `${SHEET_NAME}!P${rowIdx + 1}`, values: [[vaktId]] },
          ],
        },
      });
    }
  }
  if (rowIdx === -1) {
    await markResolved?.();
    return;
  }
  await markResolved?.();
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SPREADSHEET_ID,
    requestBody: {
      requests: [{
        deleteDimension: {
          range: { sheetId: gridId, dimension: "ROWS", startIndex: rowIdx, endIndex: rowIdx + 1 },
        },
      }],
    },
  });
  console.log(`[SheetSync] Slettet rad for vakt ${vaktId}`);
}
