import { calculatePaidHours } from "./shiftHours";
import type { Vakt } from "./schema";

export function compareWeeklyHours(
  shifts: Vakt[],
  todayIso: string,
): { currentHours: number; previousHours: number; percentChange: number | null } {
  const monday = new Date(`${todayIso}T00:00:00Z`);
  monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
  const dateAtOffset = (days: number) => {
    const date = new Date(monday);
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
  };
  const currentStart = dateAtOffset(0);
  const nextStart = dateAtOffset(7);
  const previousStart = dateAtOffset(-7);
  let currentHours = 0;
  let previousHours = 0;
  for (const shift of shifts) {
    if (shift.status !== "godkjent") continue;
    if (shift.dato >= currentStart && shift.dato < nextStart) {
      currentHours += calculatePaidHours(shift.startTid, shift.sluttTid, shift);
    } else if (shift.dato >= previousStart && shift.dato < currentStart) {
      previousHours += calculatePaidHours(shift.startTid, shift.sluttTid, shift);
    }
  }
  return {
    currentHours,
    previousHours,
    percentChange: previousHours > 0
      ? ((currentHours - previousHours) / previousHours) * 100
      : currentHours === 0 ? 0 : null,
  };
}
