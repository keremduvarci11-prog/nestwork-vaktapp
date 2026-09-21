export const AUTOMATIC_PAUSE_THRESHOLD_MINUTES = 5.5 * 60;
export const UNPAID_PAUSE_MINUTES = 30;

export const PAID_BREAK_EFFECTIVE_DATE = "2026-09-01";
export const PAID_BREAK_EXEMPT_KINDERGARTEN_IDS = [
  "99caabb6-6068-42e4-8aad-defadbb578f2",
  "58d81ed1-e4fb-49ee-8fa3-e5bccdcddea6",
] as const;

/** Date-only comparisons: the shift's date, not today's date, controls policy. */
export function hasPolicyPaidBreak(dato: string, barnehageId: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(dato) &&
    dato >= PAID_BREAK_EFFECTIVE_DATE &&
    !!barnehageId &&
    !PAID_BREAK_EXEMPT_KINDERGARTEN_IDS.some((id) => id === barnehageId);
}

interface ShiftPaidTerms extends ShiftHoursOptions {
  dato: string;
  barnehageId: string;
  startTid: string;
  sluttTid: string;
}

/** Persist these terms on writes; accounting readers keep using stored values.
 * Never clear an existing explicit paid-break agreement outside policy scope.
 */
export function shiftPaidTerms(shift: ShiftPaidTerms) {
  const betaltPause = hasPolicyPaidBreak(shift.dato, shift.barnehageId) ||
    shift.betaltPause === true;
  return {
    betaltPause,
    trekkPause: shouldDeductPause(shift.startTid, shift.sluttTid, { ...shift, betaltPause }),
  };
}

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