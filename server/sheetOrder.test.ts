import assert from "node:assert/strict";
import test from "node:test";
import {
  parseSheetDate,
  planSheetPlacement,
  sheetPlacementRequest,
} from "./sheetOrder";
import { buildSheetSyncCellRequests } from "./sheetSync";

const header = ["Uke", "Ansatt", "", "", "Dato"];
const row = (date: string, week = "") => [week, "Ansatt", "", "", date, "", "", "", "", "", "", "", "", "", "", `id-${date}`];
const blank = ["", "", "", "", ""];

function applyMockBatch(rows: string[][], requests: any[]): void {
  for (const request of requests) {
    if (request.insertDimension) {
      rows.splice(request.insertDimension.range.startIndex, 0, []);
      continue;
    }
    if (request.moveDimension) {
      const source = request.moveDimension.source.startIndex;
      const [moved] = rows.splice(source, 1);
      const destination = request.moveDimension.destinationIndex;
      rows.splice(source < destination ? destination - 1 : destination, 0, moved);
      continue;
    }
    if (request.updateCells) {
      const update = request.updateCells;
      const row = rows[update.range.startRowIndex];
      while (row.length < update.range.endColumnIndex) row.push("");
      update.rows[0].values.forEach((cell: any, offset: number) => {
        const value = cell.userEnteredValue;
        row[update.range.startColumnIndex + offset] =
          value.stringValue ?? value.numberValue;
      });
    }
  }
}

test("parses padded/unpadded, ISO, and Sheets serial dates", () => {
  assert.equal(parseSheetDate("17.09.2026")?.key, "2026-09-17");
  assert.equal(parseSheetDate("7.9.2026")?.key, "2026-09-07");
  assert.equal(parseSheetDate("2026-09-17")?.key, "2026-09-17");
  assert.equal(parseSheetDate(46377)?.key, "2026-12-21");
  assert.equal(parseSheetDate("not a date"), null);
});

test("a lone target-week row inside another week is moved out with a separator", () => {
  const rows = [header, row("21.09.2026", "39"), row("17.09.2026", "38"), row("22.09.2026", "39")];
  const placement = planSheetPlacement(rows, "2026-09-17", 2);
  assert.equal(placement.kind, "move");
  const structural = sheetPlacementRequest(placement, 9);
  applyMockBatch(rows, Array.isArray(structural) ? structural : [structural]);
  assert.equal(rows[placement.finalRowIndex][15], "id-17.09.2026");
  assert.ok(rows[placement.finalRowIndex - 1].every(value => !value));
});

test("new row insertion plus ID remains a single row after a lost response", () => {
  const rows = [header, row("16.09.2026", "38"), row("18.09.2026", "38")];
  const id = "new-shift";
  const values = row("17.09.2026", "38").slice(0, 12);
  const flags = { provetime: false, lonnUtbetalt: false, vikarkode: "KTV" };
  for (let attempt = 0; attempt < 2; attempt++) {
    const existing = rows.findIndex(r => r[15] === id);
    const placement = planSheetPlacement(rows, "2026-09-17", existing);
    assert.notEqual(placement.kind, "error");
    if (placement.kind === "error") throw new Error(placement.reason);
    const structural = sheetPlacementRequest(placement, 9);
    const requests = structural ? (Array.isArray(structural) ? structural : [structural]) : [];
    requests.push(...buildSheetSyncCellRequests(9, placement.finalRowIndex, values, existing !== -1, flags, flags, id));
    applyMockBatch(rows, requests);
  }
  assert.equal(rows.filter(r => r[15] === id).length, 1);
  assert.equal(rows[2][15], id);
  assert.equal(rows[3][4], "18.09.2026");
});

test("places a new 17.09 row before 18.09 in its ISO week and year", () => {
  const rows = [
    header,
    row("16.09.2026", "38"),
    row("18.09.2026", "38"),
    row("19.09.2026", "38"),
    blank,
    row("18.09.2025", "38"),
  ];
  const placement = planSheetPlacement(rows, "2026-09-17");
  assert.equal(placement.kind, "insert");
  assert.equal(placement.finalRowIndex, 2);
});

test("moves a misplaced existing row without globally sorting the sheet", () => {
  const rows = [
    header,
    row("17.09.2026", "38"),
    row("19.09.2026", "38"),
    row("18.09.2026", "38"),
    blank,
    row("18.09.2025", "38"),
  ];
  const placement = planSheetPlacement(rows, "2026-09-18", 3);
  assert.deepEqual(placement, {
    kind: "move",
    rowIndex: 3,
    finalRowIndex: 2,
    destinationIndex: 2,
  });
  assert.deepEqual(sheetPlacementRequest(placement, 42), {
    moveDimension: {
      source: { sheetId: 42, dimension: "ROWS", startIndex: 3, endIndex: 4 },
      destinationIndex: 2,
    },
  });
});

test("downward move uses original-coordinate destination and lands after later dates", () => {
  const rows = [
    header,
    row("17.09.2026", "38"),
    row("18.09.2026", "38"),
    row("19.09.2026", "38"),
  ];
  const placement = planSheetPlacement(rows, "19.09.2026", 1);
  assert.deepEqual(placement, {
    kind: "move",
    rowIndex: 1,
    finalRowIndex: 3,
    destinationIndex: 4,
  });
  const request = sheetPlacementRequest(placement, 42);
  assert.equal(request.moveDimension.destinationIndex, 4);
  const [source] = rows.splice(1, 1);
  const postRemovalDestination = request.moveDimension.destinationIndex - 1;
  rows.splice(postRemovalDestination, 0, source);
  assert.equal(rows[3][15], "id-17.09.2026");
});

test("a lone row already in its requested week is a no-op", () => {
  const rows = [header, row("17.09.2026", "38"), blank];
  assert.deepEqual(planSheetPlacement(rows, "17.09.2026", 1), {
    kind: "none",
    rowIndex: 1,
    finalRowIndex: 1,
  });
});

test("an equal-date source at the edge of its contiguous block is also a no-op", () => {
  const rows = [header, row("17.09.2026", "38"), row("17.09.2026", "38"), row("18.09.2026", "38")];
  assert.deepEqual(planSheetPlacement(rows, "17.09.2026", 1), {
    kind: "none",
    rowIndex: 1,
    finalRowIndex: 1,
  });
});

test("date change to a new week inserts a separator and keeps the moved row after it", () => {
  const rows = [header, row("17.09.2026", "38"), row("18.09.2026", "38")];
  const placement = planSheetPlacement(rows, "25.09.2026", 1, { gridRowCount: 20 });
  assert.equal(placement.kind, "move");
  assert.equal(placement.separatorInsertIndex, 3);
  assert.equal(placement.finalRowIndex, 3);
  assert.equal(placement.destinationIndex, 4);
  const requests = sheetPlacementRequest(placement, 42);
  assert.equal(requests.length, 2);
  const [insert, move] = requests;
  assert.equal(insert.insertDimension.range.startIndex, 3);
  assert.equal(move.moveDimension.source.startIndex, 1);
  assert.equal(move.moveDimension.destinationIndex, 4);
});

test("reuses a blank separator for a new week and respects grid bounds", () => {
  const rows = [header, row("17.09.2026", "38"), blank];
  const placement = planSheetPlacement(rows, "25.09.2026", 1, { gridRowCount: 10 });
  assert.equal(placement.kind, "move");
  assert.equal(placement.separatorInsertIndex, undefined);
  assert.equal(placement.finalRowIndex, 2);
  assert.equal(placement.destinationIndex, 3);
  assert.equal(
    planSheetPlacement([header, row("17.09.2026", "38")], "25.09.2026", 1, {
      gridRowCount: 2,
    }).kind,
    "error",
  );
});

test("validates only the destination block when moving a different-week source", () => {
  const rows = [
    header,
    row("17.09.2026", "38"),
    row("19.09.2026", "38"),
    row("25.09.2026", "39"),
  ];
  const placement = planSheetPlacement(rows, "18.09.2026", 3);
  assert.equal(placement.kind, "move");
  assert.equal(placement.finalRowIndex, 2);
});

test("refuses an already unsorted physical block instead of sorting a virtual copy", () => {
  const rows = [
    header,
    row("19.09.2026", "38"),
    row("17.09.2026", "38"),
  ];
  const placement = planSheetPlacement(rows, "18.09.2026");
  assert.equal(placement.kind, "error");
  assert.match(placement.reason, /udatert/);
});

test("mock atomic sync applies move plus ID/values once and safely replays a lost response", () => {
  const rows = [
    header,
    row("17.09.2026", "38"),
    row("18.09.2026", "38"),
    row("19.09.2026", "38"),
  ].map((item) => [...item]);
  rows[1][9] = "=MANUAL_FORMULA()";
  const desiredValues = [...rows[1].slice(0, 12)];
  desiredValues[4] = "19.09.2026";
  const current = { provetime: false, lonnUtbetalt: false, vikarkode: "KTV" };
  const previous = { ...current };
  const firstPlacement = planSheetPlacement(rows, "19.09.2026", 1);
  const firstStructural = sheetPlacementRequest(firstPlacement, 42);
  const firstRequests = [
    ...(Array.isArray(firstStructural) ? firstStructural : [firstStructural]),
    ...buildSheetSyncCellRequests(42, firstPlacement.finalRowIndex, desiredValues, true, current, previous, "id-17.09.2026"),
  ];
  applyMockBatch(rows, firstRequests);
  assert.equal(rows.findIndex((item) => item[15] === "id-17.09.2026"), 3);
  assert.equal(rows[3][9], "=MANUAL_FORMULA()");

  // Simulate a lost response: the next read locates the ID and plans no move
  // or insert, so replay cannot duplicate or address a neighboring row.
  const retryRow = rows.findIndex((item) => item[15] === "id-17.09.2026");
  const retryPlacement = planSheetPlacement(rows, "19.09.2026", retryRow);
  assert.equal(retryPlacement.kind, "none");
  assert.equal(sheetPlacementRequest(retryPlacement, 42), null);
  const retryRequests = buildSheetSyncCellRequests(42, retryRow, desiredValues, true, current, previous, "id-17.09.2026");
  applyMockBatch(rows, retryRequests);
  assert.equal(rows.filter((item) => item[15] === "id-17.09.2026").length, 1);
  assert.equal(rows[3][9], "=MANUAL_FORMULA()");
});

test("a retry after a successful move finds the ID at its new address", () => {
  const rows = [
    header,
    row("17.09.2026", "38"),
    row("19.09.2026", "38"),
    row("18.09.2026", "38"),
  ];
  const first = planSheetPlacement(rows, "18.09.2026", 3);
  assert.equal(first.kind, "move");
  const movedRows = [rows[0], rows[1], rows[3], rows[2]];
  assert.deepEqual(planSheetPlacement(movedRows, "18.09.2026", 2), {
    kind: "none",
    rowIndex: 2,
    finalRowIndex: 2,
  });
});

test("mock Sheets move keeps the whole row object, including formula and format metadata", () => {
  const rows = [
    { values: header, formula: "", format: "header" },
    { values: row("17.09.2026", "38"), formula: "=K2", format: "manual-yellow" },
    { values: row("19.09.2026", "38"), formula: "=K3", format: "manual-green" },
    { values: row("18.09.2026", "38"), formula: "=K4", format: "manual-blue" },
  ];
  const placement = planSheetPlacement(rows.map((item) => item.values), "18.09.2026", 3);
  assert.equal(placement.kind, "move");
  const request = sheetPlacementRequest(placement, 9);
  assert.equal(request?.moveDimension.destinationIndex, 2);
  const moved = rows.splice(3, 1)[0];
  rows.splice(request.moveDimension.destinationIndex, 0, moved);
  assert.equal(rows[2].values[15], "id-18.09.2026");
  assert.equal(rows[2].formula, "=K4");
  assert.equal(rows[2].format, "manual-blue");
});

test("does not move an already ordered equal-date row", () => {
  const rows = [header, row("17.09.2026", "38"), row("17.09.2026", "38"), row("18.09.2026", "38")];
  assert.deepEqual(planSheetPlacement(rows, "17.09.2026", 2), {
    kind: "none",
    rowIndex: 2,
    finalRowIndex: 2,
  });
});

test("uses ISO year as part of the group and fails closed on malformed group rows", () => {
  const rows = [
    header,
    row("01.01.2026", "1"),
    row("02.01.2026", "1"),
    blank,
    row("01.01.2025", "1"),
  ];
  const placement = planSheetPlacement(rows, "01.01.2025");
  assert.equal(placement.kind, "insert");
  assert.equal(placement.finalRowIndex, 5);

  const malformed = [header, row("17.09.2026", "38"), row("not-a-date", "38"), row("19.09.2026", "38")];
  assert.equal(planSheetPlacement(malformed, "18.09.2026").kind, "error");

  const unrelatedMalformed = [
    header,
    row("17.09.2026", "38"),
    row("19.09.2026", "38"),
    blank,
    ["38", "historical", "", "", "not-a-date"],
  ];
  assert.equal(planSheetPlacement(unrelatedMalformed, "18.09.2026").kind, "insert");
});
