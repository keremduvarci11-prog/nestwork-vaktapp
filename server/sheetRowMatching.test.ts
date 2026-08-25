import assert from "node:assert/strict";
import test from "node:test";
import { findLegacyRowMatch } from "./sheetRowMatching";

function row({
  employee = "9088 Saada",
  kindergarten = "Buggeland Barnehage",
  date = "13.08.2026",
  start = "08:00",
  end = "15:30",
  code = "RESS",
  id = "",
} = {}): string[] {
  const values = Array(16).fill("");
  values[1] = employee;
  values[2] = kindergarten;
  values[4] = date;
  values[5] = start;
  values[6] = end;
  values[11] = code;
  values[15] = id;
  return values;
}

test("claims one exact legacy row without a shift ID", () => {
  const rows = [row({ employee: "Ansatt" }), row()];
  assert.deepEqual(findLegacyRowMatch(rows, [row()]), { kind: "match", rowIndex: 1 });
});

test("ignores a row that already belongs to a shift ID", () => {
  const rows = [row({ employee: "Ansatt" }), row({ id: "shift-1" })];
  assert.deepEqual(findLegacyRowMatch(rows, [row()]), { kind: "none" });
});

test("can match the previous identity after a shift edit", () => {
  const previous = row();
  const current = row({ start: "09:00", end: "16:30" });
  const rows = [row({ employee: "Ansatt" }), previous];
  assert.deepEqual(findLegacyRowMatch(rows, [current, previous]), {
    kind: "match",
    rowIndex: 1,
  });
});

test("stops when several legacy rows could be the same shift", () => {
  const rows = [row({ employee: "Ansatt" }), row(), row()];
  assert.deepEqual(findLegacyRowMatch(rows, [row()]), {
    kind: "ambiguous",
    rowIndexes: [1, 2],
  });
});

test("does not match partial or blank rows", () => {
  const partial = row();
  partial[2] = "";
  const rows = [row({ employee: "Ansatt" }), partial];
  assert.deepEqual(findLegacyRowMatch(rows, [row()]), { kind: "none" });
});

test("matches historical kindergarten aliases", () => {
  const legacy = row({ kindergarten: "Kuventræ Espira" });
  const current = row({ kindergarten: "Espira Kuventræ Barnehage" });
  assert.deepEqual(findLegacyRowMatch([row({ employee: "Ansatt" }), legacy], [current]), {
    kind: "match",
    rowIndex: 1,
  });
});

test("matches a one-character kindergarten spelling error", () => {
  const legacy = row({ kindergarten: "Rakkerungang Gårdsbarnehage" });
  const current = row({ kindergarten: "Rakkerungan Gårdbarnehage" });
  assert.deepEqual(findLegacyRowMatch([row({ employee: "Ansatt" }), legacy], [current]), {
    kind: "match",
    rowIndex: 1,
  });
});

test("uses employee number when the historical name is misspelled", () => {
  const legacy = row({ employee: "9060 Amailie" });
  const current = row({ employee: "9060 Amalie" });
  assert.deepEqual(findLegacyRowMatch([row({ employee: "Ansatt" }), legacy], [current]), {
    kind: "match",
    rowIndex: 1,
  });
});

test("allows a missing historical shift code", () => {
  const legacy = row({ code: "" });
  assert.deepEqual(findLegacyRowMatch([row({ employee: "Ansatt" }), legacy], [row()]), {
    kind: "match",
    rowIndex: 1,
  });
});

test("does not treat a blank app shift code as a wildcard", () => {
  const legacy = row({ code: "RESS" });
  const current = row({ code: "" });
  assert.deepEqual(findLegacyRowMatch([row({ employee: "Ansatt" }), legacy], [current]), {
    kind: "none",
  });
});

test("does not match two different nonblank shift codes", () => {
  const legacy = row({ code: "RESS" });
  const current = row({ code: "LTV" });
  assert.deepEqual(findLegacyRowMatch([row({ employee: "Ansatt" }), legacy], [current]), {
    kind: "none",
  });
});

test("never matches a different employee number", () => {
  const legacy = row({ employee: "9029 Sakar" });
  const current = row({ employee: "9104 Nora" });
  assert.deepEqual(findLegacyRowMatch([row({ employee: "Ansatt" }), legacy], [current]), {
    kind: "none",
  });
});