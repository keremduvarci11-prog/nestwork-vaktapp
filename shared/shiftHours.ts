export const AUTOMATIC_PAUSE_THRESHOLD_MINUTES = 5.5 * 60;
export const UNPAID_PAUSE_MINUTES = 30;

export function shiftDurationMinutes(start: string, end: string): number {
  if (!start || !end) return 0;
  const [startHours, startMinutes] = start.split(":").map(Number);
  const [endHours, endMinutes] = end.split(":").map(Number);
  if (![startHours, startMinutes, endHours, endMinutes].every(Number.isFinite)) return 0;
  return Math.max(0, endHours * 60 + endMinutes - startHours * 60 - startMinutes);
}

export function shouldDeductPause(start: string, end: string): boolean {
  return shiftDurationMinutes(start, end) >= AUTOMATIC_PAUSE_THRESHOLD_MINUTES;
}

export function calculatePaidHours(start: string, end: string): number {
  const duration = shiftDurationMinutes(start, end);
  const paidMinutes = duration - (duration >= AUTOMATIC_PAUSE_THRESHOLD_MINUTES ? UNPAID_PAUSE_MINUTES : 0);
  return Math.max(0, paidMinutes / 60);
}