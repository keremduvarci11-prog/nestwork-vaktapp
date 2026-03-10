import { google } from 'googleapis';

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

let spreadsheetId: string | null = null;
const existingSheets = new Set<string>();

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
];

async function getOrCreateSpreadsheet(): Promise<string> {
  if (spreadsheetId) return spreadsheetId;

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

  spreadsheetId = response.data.spreadsheetId!;
  existingSheets.add("Oversikt");
  console.log(`[Google Sheets] Created spreadsheet: ${spreadsheetId}`);
  return spreadsheetId;
}

function sanitizeSheetName(name: string): string {
  return name.replace(/[\\/*?:\[\]]/g, "").substring(0, 100);
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

    await sheets.spreadsheets.values.append({
      spreadsheetId: sheetId,
      range: `'${sheetName}'!A:K`,
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
          ],
        ],
      },
    });

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
