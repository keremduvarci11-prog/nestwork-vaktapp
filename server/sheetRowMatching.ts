const ID_COLUMN_INDEX = 15;
const IDENTITY_COLUMNS = [1, 2, 4, 5, 6, 11] as const;

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

function kindergartenCore(value: unknown): string {
  return normalizeCell(value)
    .replace(/\b(espira|fus|barnehage|gårdsbarnehage|gårdbarnehage)\b/g, "")
    .replace(/[^a-zæøå0-9]/g, "");
}

function editDistance(left: string, right: string): number {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex++) {
    let diagonal = previous[0];
    previous[0] = leftIndex;
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex++) {
      const above = previous[rightIndex];
      previous[rightIndex] = Math.min(
        previous[rightIndex] + 1,
        previous[rightIndex - 1] + 1,
        diagonal + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1),
      );
      diagonal = above;
    }
  }
  return previous[right.length];
}

function sameKindergarten(left: unknown, right: unknown): boolean {
  if (normalizeCell(left) === normalizeCell(right)) return true;
  const leftCore = kindergartenCore(left);
  const rightCore = kindergartenCore(right);
  if (!leftCore || !rightCore) return false;
  if (leftCore === rightCore) return true;
  return (
    Math.min(leftCore.length, rightCore.length) >= 5 &&
    editDistance(leftCore, rightCore) <= 1
  );
}

function hasRequiredIdentity(values: readonly unknown[]): boolean {
  return [1, 2, 4, 5, 6].every((index) => normalizeCell(values[index]) !== "");
}

function hasSameIdentity(row: readonly unknown[], candidate: readonly unknown[]): boolean {
  const sameEmployee = employeeKey(row[1]) === employeeKey(candidate[1]);
  const sameKindergartenName = sameKindergarten(row[2], candidate[2]);
  const sameDateAndTimes = [4, 5, 6].every(
    (index) => normalizeCell(row[index]) === normalizeCell(candidate[index]),
  );
  const rowCode = normalizeCell(row[11]);
  const candidateCode = normalizeCell(candidate[11]);
  const compatibleCode = rowCode === candidateCode || rowCode === "";
  return sameEmployee && sameKindergartenName && sameDateAndTimes && compatibleCode;
}

export type LegacyRowMatch =
  | { kind: "none" }
  | { kind: "match"; rowIndex: number }
  | { kind: "ambiguous"; rowIndexes: number[] };

/**
 * Finds an old Sheet1 row that predates the technical shift ID in column P.
 *
 * Matching requires the same employee number, kindergarten identity, date,
 * start and end. Generic kindergarten suffixes, a one-character spelling
 * error, and a missing old shift code are tolerated because those differences
 * exist in historical rows. If several rows match, the caller must stop
 * instead of risking a duplicate or attaching the wrong row.
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