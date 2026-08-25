const ID_COLUMN_INDEX = 15;
function normalizeCell(value: unknown): string {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("nb-NO");
}

function employeeKey(value: unknown): string {
  const normalized = normalizeCell(value);
  const employeeNumber = normalized.match(/^(\d+)\b/)?.[1];
  return employeeNumber ? `id:${employeeNumber}` : `name:${normalized}`;
}

function hasRequiredIdentity(values: readonly unknown[]): boolean {
  return [1, 4, 5, 6].every((index) => normalizeCell(values[index]) !== "");
}

function hasSameIdentity(row: readonly unknown[], candidate: readonly unknown[]): boolean {
  const sameEmployee = employeeKey(row[1]) === employeeKey(candidate[1]);
  const sameDateAndTimes = [4, 5, 6].every(
    (index) => normalizeCell(row[index]) === normalizeCell(candidate[index]),
  );
  return sameEmployee && sameDateAndTimes;
}

export type LegacyRowMatch =
  | { kind: "none" }
  | { kind: "match"; rowIndex: number }
  | { kind: "ambiguous"; rowIndexes: number[] };

/**
 * Finds an old Sheet1 row that predates the technical shift ID in column P.
 *
 * Matching requires the same employee number, date, start and end. Historical
 * kindergarten names and shift codes are deliberately ignored because the
 * manually entered rows use different labels than the app. If several rows
 * match, the caller must stop instead of risking a duplicate or attaching the
 * wrong row.
 */
export function findLegacyRowMatch(
  rows: readonly (readonly unknown[])[],
  candidateValues: readonly (readonly unknown[])[],
): LegacyRowMatch {
  const candidates = candidateValues.filter(hasRequiredIdentity);
  if (candidates.length === 0) return { kind: "none" };

  const rowIndexes: number[] = [];
  for (let rowIndex = 1; rowIndex < rows.length; rowIndex++) {
    const row = rows[rowIndex] || [];
    if (normalizeCell(row[ID_COLUMN_INDEX]) !== "") continue;
    if (!hasRequiredIdentity(row)) continue;
    if (candidates.some((candidate) => hasSameIdentity(row, candidate))) {
      rowIndexes.push(rowIndex);
    }
  }

  if (rowIndexes.length === 0) return { kind: "none" };
  if (rowIndexes.length === 1) return { kind: "match", rowIndex: rowIndexes[0] };
  return { kind: "ambiguous", rowIndexes };
}