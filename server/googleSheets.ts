import { google } from 'googleapis';
import * as fs from 'fs';
import * as path from 'path';

let connectionSettings: any;

async function getAccessToken() {
  if (connectionSettings && connectionSettings.settings.expires_at && new Date(connectionSettings.settings.expires_at).getTime() > Date.now()) {
    return connectionSettings.settings.access_token;
  }
  
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME
  const xReplitToken = process.env.REPL_IDENTITY 
    ? 'repl ' + process.env.REPL_IDENTITY 
    : process.env.WEB_REPL_RENEWAL 
    ? 'depl ' + process.env.WEB_REPL_RENEWAL 
    : null;

  if (!xReplitToken) {
    throw new Error('X-Replit-Token not found for repl/depl');
  }

  connectionSettings = await fetch(
    'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=google-sheet',
    {
      headers: {
        'Accept': 'application/json',
        'X-Replit-Token': xReplitToken
      }
    }
  ).then(res => res.json()).then(data => data.items?.[0]);

  const accessToken = connectionSettings?.settings?.access_token || connectionSettings.settings?.oauth?.credentials?.access_token;

  if (!connectionSettings || !accessToken) {
    throw new Error('Google Sheet not connected');
  }
  return accessToken;
}

export async function getUncachableGoogleSheetClient() {
  const accessToken = await getAccessToken();

  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({
    access_token: accessToken
  });

  return google.sheets({ version: 'v4', auth: oauth2Client });
}

const SPREADSHEET_ID_FILE = path.join(process.cwd(), '.spreadsheet-id');
let spreadsheetId: string | null = null;
const existingSheets = new Set<string>();

function loadSpreadsheetId(): string | null {
  if (spreadsheetId) return spreadsheetId;
  try {
    if (fs.existsSync(SPREADSHEET_ID_FILE)) {
      const id = fs.readFileSync(SPREADSHEET_ID_FILE, 'utf-8').trim();
      if (id) {
        spreadsheetId = id;
        return id;
      }
    }
  } catch {}
  return null;
}

function saveSpreadsheetId(id: string) {
  spreadsheetId = id;
  try {
    fs.writeFileSync(SPREADSHEET_ID_FILE, id, 'utf-8');
  } catch (err) {
    console.error('[Google Sheets] Could not save spreadsheet ID:', err);
  }
}

const HEADER_ROW = [
  "Dato",
  "Ansatt",
  "Ansatt-ID",
  "Vikarkode",
  "Start",
  "Slutt",
  "Timer",
  "Pause",
  "Region",
  "Status",
  "Godkjent tidspunkt",
  "Sorteringsdato",
];

async function verifySpreadsheetExists(id: string): Promise<boolean> {
  try {
    const sheets = await getUncachableGoogleSheetClient();
    const meta = await sheets.spreadsheets.get({ spreadsheetId: id });
    const names = meta.data.sheets?.map(s => s.properties?.title) || [];
    names.forEach(n => { if (n) existingSheets.add(n); });
    return true;
  } catch (err: any) {
    if (err?.code === 404 || err?.status === 404 || err?.message?.includes("not found")) {
      return false;
    }
    console.warn('[Google Sheets] Transient error verifying spreadsheet, assuming it exists:', err?.message);
    return true;
  }
}

async function getOrCreateSpreadsheet(): Promise<string> {
  const saved = loadSpreadsheetId();
  if (saved) {
    const valid = await verifySpreadsheetExists(saved);
    if (valid) return saved;
    console.log('[Google Sheets] Saved spreadsheet not found, creating new one');
  }

  const sheets = await getUncachableGoogleSheetClient();
  
  const response = await sheets.spreadsheets.create({
    requestBody: {
      properties: {
        title: "Nestwork Vaktapp - Godkjente vakter",
      },
      sheets: [
        {
          properties: { title: "Oversikt" },
          data: [
            {
              startRow: 0,
              startColumn: 0,
              rowData: [
                {
                  values: [
                    { userEnteredValue: { stringValue: "Dette regnearket oppdateres automatisk." } },
                  ],
                },
                {
                  values: [
                    { userEnteredValue: { stringValue: "Hver barnehage har sin egen fane med godkjente vakter." } },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
  });

  const newId = response.data.spreadsheetId!;
  saveSpreadsheetId(newId);
  existingSheets.add("Oversikt");
  console.log(`[Google Sheets] Created spreadsheet: ${newId}`);
  return newId;
}

function sanitizeSheetName(name: string): string {
  return name.replace(/[\\/*?:\[\]]/g, "").substring(0, 100);
}

async function getSheetId(sheetName: string): Promise<number | null> {
  const sheetId = await getOrCreateSpreadsheet();
  const sheets = await getUncachableGoogleSheetClient();
  const meta = await sheets.spreadsheets.get({ spreadsheetId: sheetId });
  const sheet = meta.data.sheets?.find(s => s.properties?.title === sheetName);
  return sheet?.properties?.sheetId ?? null;
}

async function ensureSheetExists(sheetName: string): Promise<void> {
  const safeName = sanitizeSheetName(sheetName);
  if (existingSheets.has(safeName)) return;

  const sheetId = await getOrCreateSpreadsheet();
  const sheets = await getUncachableGoogleSheetClient();

  try {
    const meta = await sheets.spreadsheets.get({ spreadsheetId: sheetId });
    const names = meta.data.sheets?.map(s => s.properties?.title) || [];
    names.forEach(n => { if (n) existingSheets.add(n); });
  } catch {}

  if (existingSheets.has(safeName)) return;

  try {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: sheetId,
      requestBody: {
        requests: [
          {
            addSheet: {
              properties: { title: safeName },
            },
          },
        ],
      },
    });

    await sheets.spreadsheets.values.append({
      spreadsheetId: sheetId,
      range: `'${safeName}'!A:K`,
      valueInputOption: "RAW",
      requestBody: {
        values: [HEADER_ROW],
      },
    });

    existingSheets.add(safeName);
    console.log(`[Google Sheets] Created sheet for: ${safeName}`);
  } catch (error: any) {
    if (error?.message?.includes("already exists")) {
      existingSheets.add(safeName);
    } else {
      throw error;
    }
  }
}

async function sortSheetByDate(sheetName: string): Promise<void> {
  const safeName = sanitizeSheetName(sheetName);
  const ssId = await getOrCreateSpreadsheet();
  const numericSheetId = await getSheetId(safeName);
  if (numericSheetId === null) return;

  const sheets = await getUncachableGoogleSheetClient();

  try {
    const result = await sheets.spreadsheets.values.get({
      spreadsheetId: ssId,
      range: `'${safeName}'!A:L`,
    });
    const rowCount = result.data.values?.length || 1;
    if (rowCount <= 2) return;

    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: ssId,
      requestBody: {
        requests: [
          {
            sortRange: {
              range: {
                sheetId: numericSheetId,
                startRowIndex: 1,
                endRowIndex: rowCount,
                startColumnIndex: 0,
                endColumnIndex: 12,
              },
              sortSpecs: [
                {
                  dimensionIndex: 11,
                  sortOrder: "ASCENDING",
                },
              ],
            },
          },
        ],
      },
    });
  } catch (err) {
    console.error(`[Google Sheets] Sort failed for ${safeName}:`, err);
  }
}

export async function appendVaktToSheet(vaktData: {
  dato: string;
  barnehageNavn: string;
  region: string;
  ansattNavn: string;
  ansattId?: number | null;
  vikarkode: string;
  startTid: string;
  sluttTid: string;
  timer: number;
  trekkPause?: boolean;
  status: string;
}) {
  try {
    const sheetId = await getOrCreateSpreadsheet();
    const sheetName = sanitizeSheetName(vaktData.barnehageNavn);
    await ensureSheetExists(sheetName);

    const sheets = await getUncachableGoogleSheetClient();

    const now = new Date();
    const godkjentTid = [
      String(now.getDate()).padStart(2, "0"),
      String(now.getMonth() + 1).padStart(2, "0"),
      now.getFullYear(),
    ].join(".") + " " + [
      String(now.getHours()).padStart(2, "0"),
      String(now.getMinutes()).padStart(2, "0"),
    ].join(":");

    let formattedDato = vaktData.dato;
    if (vaktData.dato && vaktData.dato.includes("-")) {
      const [y, m, d] = vaktData.dato.split("-");
      formattedDato = `${d}.${m}.${y}`;
    }

    const formatTime = (t: string) => {
      if (!t) return "";
      const parts = t.split(":");
      return parts.slice(0, 2).map(p => p.padStart(2, "0")).join(":");
    };

    const sortableDato = vaktData.dato && vaktData.dato.includes("-")
      ? vaktData.dato
      : formattedDato.split(".").reverse().join("-");

    await sheets.spreadsheets.values.append({
      spreadsheetId: sheetId,
      range: `'${sheetName}'!A:L`,
      valueInputOption: "RAW",
      requestBody: {
        values: [
          [
            formattedDato,
            vaktData.ansattNavn,
            vaktData.ansattId || "",
            vaktData.vikarkode,
            formatTime(vaktData.startTid),
            formatTime(vaktData.sluttTid),
            vaktData.timer,
            vaktData.trekkPause ? "Ja" : "Nei",
            vaktData.region,
            vaktData.status,
            godkjentTid,
            sortableDato,
          ],
        ],
      },
    });

    await sortSheetByDate(sheetName);

    console.log(`[Google Sheets] Added vakt to '${sheetName}': ${vaktData.ansattNavn}`);
  } catch (error) {
    console.error("[Google Sheets] Failed to append vakt:", error);
  }
}

export async function getSpreadsheetUrl(): Promise<string | null> {
  try {
    const id = await getOrCreateSpreadsheet();
    return `https://docs.google.com/spreadsheets/d/${id}`;
  } catch {
    return null;
  }
}
