import { ReplitConnectors } from "@replit/connectors-sdk";

const ORIGINAL_SPREADSHEET_ID =
  process.env.VAKT_SHEET_ID || "1fd7xZET8otXv3uVFThpPq96pKsE3EDidNAMfjuVNZFA";

const connectors = new ReplitConnectors();

async function connectorRequest(
  path: string,
  options?: { method?: string; body?: unknown },
): Promise<any> {
  const response = await connectors.proxy("google-sheet", path, {
    method: options?.method,
    body: options?.body,
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(
      `Google Sheets connector failed (${response.status}): ${detail.slice(0, 500)}`,
    );
  }
  return response.json();
}

export async function getUncachableGoogleSheetClient() {
  return {
    spreadsheets: {
      get: async ({
        spreadsheetId,
        fields,
        ranges,
        includeGridData,
      }: {
        spreadsheetId: string;
        fields?: string;
        ranges?: string | string[];
        includeGridData?: boolean;
      }) => {
        const params = new URLSearchParams();
        if (fields) params.set("fields", fields);
        const requestedRanges = Array.isArray(ranges) ? ranges : ranges ? [ranges] : [];
        for (const range of requestedRanges) params.append("ranges", range);
        if (includeGridData !== undefined) {
          params.set("includeGridData", String(includeGridData));
        }
        const query = params.toString();
        const data = await connectorRequest(
          `/v4/spreadsheets/${spreadsheetId}${query ? `?${query}` : ""}`,
        );
        return { data };
      },
      values: {
        get: async ({
          spreadsheetId,
          range,
        }: {
          spreadsheetId: string;
          range: string;
        }) => {
          const data = await connectorRequest(
            `/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}`,
          );
          return { data };
        },
        batchUpdate: async ({
          spreadsheetId,
          requestBody,
        }: {
          spreadsheetId: string;
          requestBody: unknown;
        }) => {
          const data = await connectorRequest(
            `/v4/spreadsheets/${spreadsheetId}/values:batchUpdate`,
            { method: "POST", body: requestBody },
          );
          return { data };
        },
      },
      batchUpdate: async ({
        spreadsheetId,
        requestBody,
      }: {
        spreadsheetId: string;
        requestBody: unknown;
      }) => {
        const data = await connectorRequest(
          `/v4/spreadsheets/${spreadsheetId}:batchUpdate`,
          { method: "POST", body: requestBody },
        );
        return { data };
      },
    },
  };
}

export async function getSpreadsheetUrl(): Promise<string> {
  return `https://docs.google.com/spreadsheets/d/${ORIGINAL_SPREADSHEET_ID}`;
}