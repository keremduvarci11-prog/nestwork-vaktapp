type Shift = {
  id: string;
  dato: string;
  barnehageId: string;
  ansattId: string | null;
  startTid: string;
};

const collator = new Intl.Collator("nb-NO", { sensitivity: "base", numeric: true });

export function sortDashboardShifts<T extends Shift>(
  shifts: readonly T[],
  kindergartens: readonly { id: string; name: string }[],
  employees: readonly { id: string; name: string }[],
): T[] {
  const names = new Map(kindergartens.map(b => [b.id, b.name]));
  const employeeNames = new Map(employees.map(u => [u.id, u.name]));
  return [...shifts].sort((a, b) =>
    a.dato.localeCompare(b.dato) ||
    collator.compare(names.get(a.barnehageId) ?? a.barnehageId, names.get(b.barnehageId) ?? b.barnehageId) ||
    // Keep distinct kindergartens together even if they have the same name.
    a.barnehageId.localeCompare(b.barnehageId) ||
    (a.startTid || "00:00").localeCompare(b.startTid || "00:00") ||
    collator.compare(employeeNames.get(a.ansattId ?? "") ?? "", employeeNames.get(b.ansattId ?? "") ?? "") ||
    a.id.localeCompare(b.id),
  );
}
