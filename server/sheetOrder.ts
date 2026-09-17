/**
 * Pure helpers for keeping Sheet1's dated rows in order.
 *
 * A sheet row is deliberately moved as a dimension rather than copied.  This
 * is important because copy/update operations turn formulas into their
 * displayed values and lose formatting and manually maintained columns.
 */

export type SheetDate = {
  key: string;
  isoWeek: number;
  isoYear: number;
};

export type SheetPlacement =
  | { kind: "none"; rowIndex: number; finalRowIndex: number }
  | {
      kind: "insert";
      rowIndex: -1;
      finalRowIndex: number;
      reason: "new-week";
    }
  | {
      kind: "move";
      rowIndex: number;
      finalRowIndex: number;
      destinationIndex: number;
      sourceIndexAfterInsert?: number;
      separatorInsertIndex?: number;
    }
  | { kind: "error"; rowIndex: number; reason: string };

const DATE_COLUMN_INDEX = 4;
const WEEK_COLUMN_INDEX = 0;

function utcDate(year: number, month: number, day: number): Date | null {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return null;
  }
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return date;
}

function dateResult(date: Date): SheetDate {
  const day = date.getUTCDay() || 7;
  const thursday = new Date(date.getTime());
  thursday.setUTCDate(date.getUTCDate() + 4 - day);
  const isoYear = thursday.getUTCFullYear();
  const yearStart = new Date(Date.UTC(isoYear, 0, 1));
  const isoWeek = Math.ceil(
    ((thursday.getTime() - yearStart.getTime()) / 86400000 + 1) / 7,
  );
  const key = [
    date.getUTCFullYear().toString().padStart(4, "0"),
    (date.getUTCMonth() + 1).toString().padStart(2, "0"),
    date.getUTCDate().toString().padStart(2, "0"),
  ].join("-");
  return { key, isoWeek, isoYear };
}

/**
 * Parses the forms that Google Sheets commonly returns for this column:
 * dd.mm.yyyy, yyyy-mm-dd, and a date serial (the 1899-12-30 epoch used by
 * Sheets).  Times and locale-dependent strings are intentionally rejected.
 */
export function parseSheetDate(value: unknown): SheetDate | null {
  if (typeof value === "number" || (typeof value === "string" && /^\d+(?:\.\d+)?$/.test(value.trim()))) {
    const serial = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(serial) || serial < 1 || serial > 200000) return null;
    const date = new Date(Date.UTC(1899, 11, 30) + Math.floor(serial) * 86400000);
    return dateResult(date);
  }

  const text = String(value ?? "").trim();
  let match = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(text);
  if (match) {
    const date = utcDate(Number(match[3]), Number(match[2]), Number(match[1]));
    return date ? dateResult(date) : null;
  }
  match = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(text);
  if (match) {
    const date = utcDate(Number(match[1]), Number(match[2]), Number(match[3]));
    return date ? dateResult(date) : null;
  }
  return null;
}

function isBlankRow(row: readonly unknown[] | undefined): boolean {
  return !row || row.every((value) => String(value ?? "").trim() === "");
}

function isContentRow(row: readonly unknown[] | undefined): boolean {
  return !isBlankRow(row);
}

function weekCellMatches(row: readonly unknown[], date: SheetDate): boolean {
  const week = String(row[WEEK_COLUMN_INDEX] ?? "").trim();
  return week !== "" && Number(week) === date.isoWeek;
}

/**
 * Finds a stable insertion/move point in one dated block.  Blank rows are
 * separators and are never crossed while sorting a block.  A malformed row
 * inside the candidate block makes the operation fail closed.
 */
export function planSheetPlacement(
  rows: readonly (readonly unknown[])[],
  desiredDateValue: unknown,
  existingRowIndex = -1,
  options: { gridRowCount?: number } = {},
): SheetPlacement {
  const desired = parseSheetDate(desiredDateValue);
  if (!desired) {
    return {
      kind: "error",
      rowIndex: existingRowIndex,
      reason: `ugyldig dato ${String(desiredDateValue ?? "")}`,
    };
  }

  const remaining = rows
    .map((row, index) => ({ row, index }))
    .filter(({ index }) => index !== existingRowIndex);
  const matching = remaining.filter(({ row }) => {
    const date = parseSheetDate(row[DATE_COLUMN_INDEX]);
    return date?.isoWeek === desired.isoWeek && date.isoYear === desired.isoYear;
  });

  const segmentOf = (index: number): number => {
    let segment = 0;
    for (let i = 1; i <= index; i++) {
      if (isBlankRow(rows[i - 1])) segment++;
    }
    return segment;
  };
  const matchingSegments = new Set(matching.map(({ index }) => segmentOf(index)));

  // A week number without a parseable date is not enough to identify a safe
  // destination (week 1 exists in every year).  Refuse to guess if such a
  // row is in the relevant candidate block. Rows in unrelated historical
  // blocks are intentionally ignored.
  const candidateIndexes = remaining
    .filter(({ row }) => weekCellMatches(row, desired))
    .filter(({ index }) => matchingSegments.size === 0 || matchingSegments.has(segmentOf(index)))
    .map(({ index }) => index);
  if (candidateIndexes.some((index) => !parseSheetDate(rows[index][DATE_COLUMN_INDEX]))) {
    return {
      kind: "error",
      rowIndex: existingRowIndex,
      reason: `ugyldig dato i uke ${desired.isoWeek}, ${desired.isoYear}`,
    };
  }

  const failIfOutOfBounds = (index: number): SheetPlacement | null => {
    if (options.gridRowCount !== undefined && index >= options.gridRowCount) {
      return {
        kind: "error",
        rowIndex: existingRowIndex,
        reason: `arket har ikke plass til rad ${index + 1}`,
      };
    }
    return null;
  };

  if (matching.length === 0) {
    const lastNonEmptyPosition = remaining.reduce(
      (last, item, position) => (isContentRow(item.row) ? position : last),
      -1,
    );
    const source = existingRowIndex;

    // A single-row week is already correctly placed when the row itself has
    // the requested date and week. It was excluded from `matching` above.
    if (
      source !== -1 &&
      parseSheetDate(rows[source]?.[DATE_COLUMN_INDEX])?.key === desired.key &&
      weekCellMatches(rows[source] || [], desired) &&
      (source <= 1 || isBlankRow(rows[source - 1])) &&
      (source + 1 >= rows.length || isBlankRow(rows[source + 1]))
    ) {
      return { kind: "none", rowIndex: source, finalRowIndex: source };
    }

    if (existingRowIndex === -1) {
      const destination =
        lastNonEmptyPosition === -1
          ? 1
          : remaining[lastNonEmptyPosition].index + 2;
      return (
        failIfOutOfBounds(destination) || {
          kind: "insert",
          rowIndex: -1,
          finalRowIndex: destination,
          reason: "new-week",
        }
      );
    }

    // A genuinely new week gets a separator. Reuse an existing blank row
    // immediately after the remaining data, otherwise insert one atomically
    // before moving the source row.
    const lastContent = remaining[lastNonEmptyPosition];
    const nextPhysicalRow = lastContent
      ? rows.findIndex(
          (row, index) => index > lastContent.index && index !== source && isContentRow(row),
        )
      : -1;
    const separatorCandidate = lastContent
      ? rows.findIndex(
          (row, index) =>
            index > lastContent.index &&
            index !== source &&
            (nextPhysicalRow === -1 || index < nextPhysicalRow) &&
            isBlankRow(row),
        )
      : -1;
    const blankAfter =
      lastContent && separatorCandidate !== -1
        ? separatorCandidate
        : -1;
    const separatorInsertIndex =
      blankAfter === -1 ? (lastContent ? lastContent.index + 1 : 1) : -1;
    const separatorPosition =
      blankAfter === -1
        ? separatorInsertIndex
        : remaining.findIndex(({ index }) => index === blankAfter);
    const sourceIndexAfterInsert =
      separatorInsertIndex !== -1 && source >= separatorInsertIndex
        ? source + 1
        : source;
    const finalRowIndex =
      separatorInsertIndex === -1
        ? separatorPosition + 1
        : separatorInsertIndex + (source >= separatorInsertIndex ? 1 : 0);
    const capacityError =
      failIfOutOfBounds(finalRowIndex) ||
      (separatorInsertIndex !== -1
        ? failIfOutOfBounds(separatorInsertIndex)
        : null);
    if (capacityError) return capacityError;
    if (sourceIndexAfterInsert === finalRowIndex && separatorInsertIndex === -1) {
      return { kind: "none", rowIndex: source, finalRowIndex: source };
    }
    return {
      kind: "move",
      rowIndex: source,
      finalRowIndex,
      destinationIndex:
        finalRowIndex + (sourceIndexAfterInsert < finalRowIndex ? 1 : 0),
      sourceIndexAfterInsert,
      separatorInsertIndex: separatorInsertIndex === -1 ? undefined : separatorInsertIndex,
    };
  }

  if (matchingSegments.size > 1) {
    return {
      kind: "error",
      rowIndex: existingRowIndex,
      reason: `flere separate blokker for uke ${desired.isoWeek}, ${desired.isoYear}`,
    };
  }
  const first = Math.min(...matching.map(({ index }) => index));
  const last = Math.max(...matching.map(({ index }) => index));
  for (let index = first; index <= last; index++) {
    if (index === existingRowIndex) continue;
    if (!isContentRow(rows[index])) continue;
    const blockDate = parseSheetDate(rows[index][DATE_COLUMN_INDEX]);
    if (
      !blockDate ||
      blockDate.isoWeek !== desired.isoWeek ||
      blockDate.isoYear !== desired.isoYear
    ) {
      return {
        kind: "error",
        rowIndex: existingRowIndex,
        reason: `ugyldig dato i datoblokken for uke ${desired.isoWeek}, ${desired.isoYear}`,
      };
    }
  }

  // A row already in non-decreasing order is left in place.  In particular,
  // equal-date rows retain their existing order and are not needlessly moved.
  if (existingRowIndex !== -1) {
    const current = parseSheetDate(rows[existingRowIndex][DATE_COLUMN_INDEX]);
    const sourceSegment = segmentOf(existingRowIndex);
    let blockFirst = first;
    let blockLast = last;
    const isTargetBlockRow = (index: number): boolean => {
      if (index === existingRowIndex) return true;
      const date = parseSheetDate(rows[index]?.[DATE_COLUMN_INDEX]);
      return (
        date?.isoWeek === desired.isoWeek &&
        date.isoYear === desired.isoYear &&
        segmentOf(index) === matchingSegments.values().next().value
      );
    };
    while (blockFirst > 0 && isTargetBlockRow(blockFirst - 1)) blockFirst--;
    while (blockLast + 1 < rows.length && isTargetBlockRow(blockLast + 1)) blockLast++;
    const sourceInBlock =
      current?.key === desired.key &&
      matchingSegments.size === 1 &&
      matchingSegments.has(sourceSegment) &&
      existingRowIndex >= blockFirst &&
      existingRowIndex <= blockLast;
    if (sourceInBlock) {
      const before = matching.filter(({ index }) => index < existingRowIndex);
      const after = matching.filter(({ index }) => index > existingRowIndex);
      const outOfOrder =
        before.some(({ row }) => (parseSheetDate(row[DATE_COLUMN_INDEX])?.key || "") > desired.key) ||
        after.some(({ row }) => (parseSheetDate(row[DATE_COLUMN_INDEX])?.key || "") < desired.key);
      if (!outOfOrder) return { kind: "none", rowIndex: existingRowIndex, finalRowIndex: existingRowIndex };
    }
  }

  const ordered = matching;
  for (let index = 1; index < ordered.length; index++) {
    const previousKey = parseSheetDate(ordered[index - 1].row[DATE_COLUMN_INDEX])!.key;
    const currentKey = parseSheetDate(ordered[index].row[DATE_COLUMN_INDEX])!.key;
    if (currentKey < previousKey) {
      return {
        kind: "error",
        rowIndex: existingRowIndex,
        reason: `udatert datoblokk for uke ${desired.isoWeek}, ${desired.isoYear}`,
      };
    }
  }
  const orderedInsertionAt = ordered.findIndex(
    ({ row }) => parseSheetDate(row[DATE_COLUMN_INDEX])!.key > desired.key,
  );
  const insertionAt =
    orderedInsertionAt === -1
      ? remaining.findIndex(({ index }) => index === ordered[ordered.length - 1].index) + 1
      : remaining.findIndex(({ index }) => index === ordered[orderedInsertionAt].index);
  const finalRowIndex = insertionAt;

  if (existingRowIndex === -1) {
    return (
      failIfOutOfBounds(finalRowIndex) || {
        kind: "insert",
        rowIndex: -1,
        finalRowIndex,
        reason: "new-week",
      }
    );
  }
  if (finalRowIndex === existingRowIndex) {
    return { kind: "none", rowIndex: existingRowIndex, finalRowIndex: existingRowIndex };
  }
  return {
    kind: "move",
    rowIndex: existingRowIndex,
    finalRowIndex,
    destinationIndex:
      finalRowIndex + (existingRowIndex < finalRowIndex ? 1 : 0),
  };
}

export function sheetPlacementRequest(
  placement: SheetPlacement,
  sheetId: number,
): any | null {
  if (placement.kind === "insert") {
    return {
      insertDimension: {
        range: {
          sheetId,
          dimension: "ROWS",
          startIndex: placement.finalRowIndex,
          endIndex: placement.finalRowIndex + 1,
        },
        // Row 0 is the header; never inherit its formatting for the first
        // inserted data row.
        inheritFromBefore: placement.finalRowIndex > 1,
      },
    };
  }
  if (placement.kind === "move") {
    const moveRequest = {
      moveDimension: {
        source: {
          sheetId,
          dimension: "ROWS",
          startIndex: placement.rowIndex,
          endIndex: placement.rowIndex + 1,
        },
        destinationIndex: placement.destinationIndex,
      },
    };
    if (placement.separatorInsertIndex === undefined) return moveRequest;
    const insertRequest = {
      insertDimension: {
        range: {
          sheetId,
          dimension: "ROWS",
          startIndex: placement.separatorInsertIndex,
          endIndex: placement.separatorInsertIndex + 1,
        },
        inheritFromBefore: false,
      },
    };
    if (placement.sourceIndexAfterInsert === placement.finalRowIndex) {
      return [insertRequest];
    }
    return [
      insertRequest,
      {
        moveDimension: {
          ...moveRequest.moveDimension,
          source: {
            ...moveRequest.moveDimension.source,
            startIndex: placement.sourceIndexAfterInsert ?? placement.rowIndex,
            endIndex: (placement.sourceIndexAfterInsert ?? placement.rowIndex) + 1,
          },
        },
      },
    ];
  }
  return null;
}