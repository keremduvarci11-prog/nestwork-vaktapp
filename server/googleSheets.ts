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

// WARNING: Never cache this client.
export async function getUncachableGoogleSheetClient() {
  const accessToken = await getAccessToken();

  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({
    access_token: accessToken
  });

  return google.sheets({ version: 'v4', auth: oauth2Client });
}

let spreadsheetId: string | null = null;

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
          properties: { title: "Vakter" },
          data: [
            {
              startRow: 0,
              startColumn: 0,
              rowData: [
                {
                  values: [
                    { userEnteredValue: { stringValue: "Dato" } },
                    { userEnteredValue: { stringValue: "Barnehage" } },
                    { userEnteredValue: { stringValue: "Region" } },
                    { userEnteredValue: { stringValue: "Ansatt" } },
                    { userEnteredValue: { stringValue: "Vikarkode" } },
                    { userEnteredValue: { stringValue: "Start" } },
                    { userEnteredValue: { stringValue: "Slutt" } },
                    { userEnteredValue: { stringValue: "Timer" } },
                    { userEnteredValue: { stringValue: "Status" } },
                    { userEnteredValue: { stringValue: "Godkjent tidspunkt" } },
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
  console.log(`[Google Sheets] Created spreadsheet: ${spreadsheetId}`);
  return spreadsheetId;
}

export async function appendVaktToSheet(vaktData: {
  dato: string;
  barnehageNavn: string;
  region: string;
  ansattNavn: string;
  vikarkode: string;
  startTid: string;
  sluttTid: string;
  timer: number;
  status: string;
}) {
  try {
    const sheetId = await getOrCreateSpreadsheet();
    const sheets = await getUncachableGoogleSheetClient();

    const now = new Date().toLocaleString("nb-NO", { timeZone: "Europe/Oslo" });

    await sheets.spreadsheets.values.append({
      spreadsheetId: sheetId,
      range: "Vakter!A:J",
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: [
          [
            vaktData.dato,
            vaktData.barnehageNavn,
            vaktData.region,
            vaktData.ansattNavn,
            vaktData.vikarkode,
            vaktData.startTid,
            vaktData.sluttTid,
            vaktData.timer,
            vaktData.status,
            now,
          ],
        ],
      },
    });

    console.log(`[Google Sheets] Added vakt: ${vaktData.ansattNavn} @ ${vaktData.barnehageNavn}`);
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
