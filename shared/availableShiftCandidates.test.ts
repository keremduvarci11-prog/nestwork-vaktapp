import assert from "node:assert/strict";
import test from "node:test";
import type { User, Vakt, Availability } from "./schema";
import { availableShiftCandidates } from "./availableShiftCandidates";

const shift = { id: "open", dato: "2026-10-21", startTid: "08:00", sluttTid: "16:00", status: "ledig", ansattId: null, region: "Os" } as Vakt;
const user = (id: string, region = "Os") => ({ id, name: id, role: "ansatt", status: "Aktiv", region, stilling: "Assistent" }) as User;
const day = (id: string, date = shift.dato, status = "available") => ({ userId: id, date, status }) as Availability;

test("calendar availability works without a request and preserves legacy multi-region visibility", () => {
  const users = [user("local"), user("bergen", "Bergen"), user("multi", "Os/Fusa"), user("wrong", "Kristiansand"), user("unknown"), user("away")];
  const result = availableShiftCandidates(shift, users,
    [...users.filter(u => u.id !== "unknown").map(u => day(u.id)), day("away", shift.dato, "unavailable")].filter(a => a.userId !== "away" || a.status === "unavailable"), [],
    [{ ansattId: "bergen" }]);
  assert.deepEqual(result.map(u => u.userId), ["bergen", "local", "multi"]);
  assert.equal(result.find(u => u.userId === "local")?.hasRequested, false);
  assert.equal(result.find(u => u.userId === "bergen")?.hasRequested, true);
});

test("inactive users, admins, other dates, blocked days and assigned target shifts are excluded", () => {
  const users = [user("ok"), { ...user("inactive"), status: "Inaktiv" }, { ...user("admin"), role: "admin" }, user("other-date")];
  const calendar = [day("ok"), day("inactive"), day("admin"), day("other-date", "2026-10-20")];
  assert.deepEqual(availableShiftCandidates(shift, users, calendar, []).map(u => u.userId), ["ok"]);
  assert.deepEqual(availableShiftCandidates(shift, users, calendar, [], [], true), []);
  assert.deepEqual(availableShiftCandidates({ ...shift, status: "tildelt", ansattId: "someone" }, users, calendar, []), []);
});

test("overlapping assignments exclude employees but adjoining and separate shifts do not", () => {
  const users = ["overlap", "ends-before", "starts-after", "overnight", "different-day"].map(id => user(id));
  const existing = [
    { id: "1", ansattId: "overlap", dato: shift.dato, startTid: "15:00", sluttTid: "17:00" },
    { id: "2", ansattId: "ends-before", dato: shift.dato, startTid: "06:00", sluttTid: "08:00" },
    { id: "3", ansattId: "starts-after", dato: shift.dato, startTid: "16:00", sluttTid: "18:00" },
    { id: "4", ansattId: "overnight", dato: "2026-10-20", startTid: "22:00", sluttTid: "09:00" },
    { id: "5", ansattId: "different-day", dato: "2026-10-20", startTid: "08:00", sluttTid: "16:00" },
  ] as Vakt[];
  assert.deepEqual(availableShiftCandidates(shift, users, users.map(u => day(u.id)), existing).map(u => u.userId),
    ["different-day", "ends-before", "starts-after"]);
});
