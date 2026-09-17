export const AUTOMATIC_PAUSE_THRESHOLD_MINUTES = 5.5 * 60;
export const UNPAID_PAUSE_MINUTES = 30;

export interface ShiftHoursOptions {
  /**
   * An explicit paid break disables the otherwise automatic unpaid-break rule.
   * `false` intentionally preserves the automatic rule for ordinary shifts.
   */
  betaltPause?: boolean | null;
  /**
   * An agreed paid-hours value is an explicit total-hours override.  Database
   * decimal columns are returned as strings, so both forms are supported.
   */
  avtalteBetalteTimer?: number | string | null;
}

function explicitPaidHours(options?: ShiftHoursOptions): number | null {
  const value = options?.avtalteBetalteTimer;
  if (value === null || value === undefined || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(String(value).replace(",", "."));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

export function shiftDurationMinutes(start: string, end: string): number {
  if (!start || !end) return 0;
  const [startHours, startMinutes] = start.split(":").map(Number);
  const [endHours, endMinutes] = end.split(":").map(Number);
  if (![startHours, startMinutes, endHours, endMinutes].every(Number.isFinite)) return 0;
  return Math.max(0, endHours * 60 + endMinutes - startHours * 60 - startMinutes);
}

export function shouldDeductPause(
  start: string,
  end: string,
  options?: ShiftHoursOptions,
): boolean {
  if (options?.betaltPause === true || explicitPaidHours(options) !== null) return false;
  return shiftDurationMinutes(start, end) >= AUTOMATIC_PAUSE_THRESHOLD_MINUTES;
}

export function calculatePaidHours(
  start: string,
  end: string,
  options?: ShiftHoursOptions,
): number {
  const agreedHours = explicitPaidHours(options);
  if (agreedHours !== null) return agreedHours;
  const duration = shiftDurationMinutes(start, end);
  const paidMinutes = duration - (
    shouldDeductPause(start, end, options) ? UNPAID_PAUSE_MINUTES : 0
  );
  return Math.max(0, paidMinutes / 60);
}