import type { Vakt } from "./schema";

/** Include vacancies even when nobody has requested them yet. */
export function approvalOpenShifts(shifts: Vakt[]): Vakt[] {
  return shifts
    .filter((shift) => shift.status === "ledig" && !shift.ansattId)
    .sort((a, b) =>
      a.dato.localeCompare(b.dato) ||
      a.startTid.localeCompare(b.startTid) ||
      a.id.localeCompare(b.id),
    );
}
