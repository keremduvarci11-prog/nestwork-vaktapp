// Synkroniserer vakter til admins eget Google Sheets-dokument ("vaktloggen")
// Appen er fasit — arket fylles og oppdateres automatisk, rad for rad.
// Kolonner: A=Uke, B=Ansatt, C=Kunde/Barnehage, D=Kommentar, E=Dato,
//           F=Fra kl, G=Til kl, H=Timer, I=Timelønn, J=Fakturert?,
//           K=Har vi betalt?, L=Faktura markeres med (kode)
//           P=VaktID (skjult teknisk kolonne som kobler rad til vakt i appen)
import { getUncachableGoogleSheetClient } from "./googleSheets";
import { storage } from "./storage";
import type { Vakt, User, Barnehage } from "@shared/schema";

const SPREADSHEET_ID =
  process.env.VAKT_SHEET_ID || "1iGTVCjApX88NCYtZT_5CRqVT7cls5ZvhNrLeKSuzbXc";
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
  if (!vakt.startTid || !vakt.sluttTid) return 0;
  const [sh, sm] = vakt.startTid.split(":").map(Number);
  const [eh, em] = vakt.sluttTid.split(":").map(Number);
  // Arket føres med brutto timer (pause trekkes ikke fra i vaktloggen)
  const timer = (eh * 60 + em - sh * 60 - sm) / 60;
  return Math.max(0, Math.round(timer * 100) / 100);
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
    "", // I: Timelønn — føres ikke i arket
    "", // J: står tom
    vakt.lonnUtbetalt ? "Ja" : "Nei", // K
    vakt.vikarkode || "", // L: kode
  ];
}

async function getSheetGridId(sheets: any): Promise<number> {
  const meta = await sheets.spreadsheets.get({
    spreadsheetId: SPREADSHEET_ID,
    fields: "sheets.properties",
  });
  const sheet = meta.data.sheets?.find((s: any) => s.properties?.title === SHEET_NAME);
  return sheet?.properties?.sheetId ?? 0;
}

function cellFormatRequests(gridId: number, rowIdx: number, vakt: Vakt): any[] {
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
    // I–J og M–P: nøytral formatering (hvit bakgrunn, svart tekst)
    ...[[8, 10], [12, 16]].map(([start, end]) => ({
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
    })),
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
  requests.push(
    { updateBorders: { range: borderRange(0, 8), top: solid, bottom: solid, left: solid, right: solid, innerVertical: solid } },
    { updateBorders: { range: borderRange(8, 10), top: none, bottom: none, innerVertical: none } },
    { updateBorders: { range: borderRange(10, 12), top: solid, bottom: solid, left: solid, right: solid, innerVertical: solid } },
  );
  return requests;
}

// Enkel kø slik at samtidige synk-kall ikke roter til radplassering.
// Vaktdata hentes FERSKT inne i køen (ikke ved kø-tidspunkt), slik at en
// treg tidligere endring aldri kan overskrive en nyere — og en slettet
// vakt aldri gjenoppstår i arket.
let syncChain: Promise<void> = Promise.resolve();

export function queueVaktSync(vaktId: string): void {
  syncChain = syncChain
    .then(async () => {
      const vakt = await storage.getVakt(vaktId);
      if (!vakt) return; // slettet i mellomtiden — remove-jobben tar seg av raden
      const ansatt = vakt.ansattId ? await storage.getUser(vakt.ansattId) : null;
      const barnehage = await storage.getBarnehage(vakt.barnehageId);
      await doSync(vakt, ansatt ?? null, barnehage ?? null);
    })
    .catch((err) => console.error("[SheetSync] Feil ved synk:", err?.message || err));
}

export function removeVaktRowFromSheet(vaktId: string): void {
  syncChain = syncChain
    .then(() => doRemove(vaktId))
    .catch((err) => console.error("[SheetSync] Feil ved sletting:", err?.message || err));
}

async function doSync(vakt: Vakt, ansatt: User | null, barnehage: Barnehage | null): Promise<void> {
  const sheets = await getUncachableGoogleSheetClient();
  const gridId = await getSheetGridId(sheets);

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: READ_RANGE,
  });
  const rows: string[][] = res.data.values || [];

  const values = buildRowValues(vakt, ansatt, barnehage);
  const uke = isoWeek(vakt.dato);

  // Finn eksisterende rad for denne vakten (kolonne P)
  let rowIdx = rows.findIndex((r) => r[ID_COL_INDEX] === vakt.id);

  if (rowIdx === -1) {
    // Ny rad. Plasser den sortert på dato INNE i riktig ukeblokk:
    // rett etter siste eksisterende rad med samme eller tidligere dato,
    // slik at alle vakter på samme dag ligger samlet.
    let lastNonEmpty = 0;
    rows.forEach((r, i) => {
      if (r.some((c) => String(c).trim() !== "")) lastNonEmpty = i;
    });
    let firstWeekRow = -1;
    let lastWeekRow = -1;
    for (let i = 1; i < rows.length; i++) {
      if (String(rows[i][0]).trim() === String(uke)) {
        if (firstWeekRow === -1) firstWeekRow = i;
        lastWeekRow = i;
      }
    }

    if (lastWeekRow !== -1) {
      // Finn riktig plass i ukeblokken: etter siste rad med dato <= vaktens dato
      const newDateKey = vakt.dato; // yyyy-mm-dd sorterer riktig
      rowIdx = firstWeekRow; // default: øverst i blokken
      for (let i = firstWeekRow; i <= lastWeekRow; i++) {
        const dateCell = String(rows[i]?.[4] || "").trim(); // dd.mm.yyyy
        const parts = dateCell.split(".");
        const key = parts.length === 3 ? `${parts[2]}-${parts[1]}-${parts[0]}` : "";
        if (key && key <= newDateKey) rowIdx = i + 1;
      }
      // Sett alltid inn en ny rad slik at rader under skyves ned
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: SPREADSHEET_ID,
        requestBody: {
          requests: [{
            insertDimension: {
              range: { sheetId: gridId, dimension: "ROWS", startIndex: rowIdx, endIndex: rowIdx + 1 },
              inheritFromBefore: rowIdx > firstWeekRow,
            },
          }],
        },
      });
    } else {
      // Ny uke → nederst, med én blank rad mellom ukene
      rowIdx = lastNonEmpty + 2;
    }
  }

  const rowNum = rowIdx + 1;
  // Skriv verdier og ID-kolonnen i samme kall (atomisk nok til at raden
  // aldri blir stående uten ID-merke)
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: SPREADSHEET_ID,
    requestBody: {
      valueInputOption: "RAW",
      data: [
        { range: `${SHEET_NAME}!A${rowNum}:L${rowNum}`, values: [values] },
        { range: `${SHEET_NAME}!P${rowNum}`, values: [[vakt.id]] },
      ],
    },
  });
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SPREADSHEET_ID,
    requestBody: { requests: cellFormatRequests(gridId, rowIdx, vakt) },
  });
  console.log(`[SheetSync] Rad ${rowNum} synket for vakt ${vakt.id} (${values[1]} ${values[4]})`);
}

async function doRemove(vaktId: string): Promise<void> {
  const sheets = await getUncachableGoogleSheetClient();
  const gridId = await getSheetGridId(sheets);
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: READ_RANGE,
  });
  const rows: string[][] = res.data.values || [];
  const rowIdx = rows.findIndex((r) => r[ID_COL_INDEX] === vaktId);
  if (rowIdx === -1) return;
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
