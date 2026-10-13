import { calculatePaidHours, type ShiftHoursOptions } from "./shiftHours";

// A reserved, human-readable line in the existing shift description keeps the
// agreement visible in the billing sheet and deployable without a DB migration.
const PREFIX = "Avtalt timelønn:";
const LINE = /^Avtalt timelønn: (\d+(?:[.,]\d{1,2})?) kr\/t \(kun denne vakten\)\.$/;
type PayShift = ShiftHoursOptions & {
  beskrivelse?: string | null;
  startTid: string;
  sluttTid: string;
};

export function parseHourlyRate(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const text = String(value).trim().replace(",", ".");
  if (!/^\d+(?:\.\d{1,2})?$/.test(text) || Number(text) > 99999999.99) {
    throw new Error("Avtalt timelønn må være et beløp med maks to desimaler");
  }
  return Number(text);
}

export function agreedHourlyRate(shift: { beskrivelse?: string | null }): number | null {
  const lines = (shift.beskrivelse || "").split("\n").filter(line => line.trim().startsWith(PREFIX));
  if (!lines.length) return null;
  const match = lines.length === 1 ? lines[0].trim().match(LINE) : null;
  if (!match) throw new Error("Ugyldig eller gjentatt avtale om timelønn på vakten");
  return parseHourlyRate(match[1]);
}

export function descriptionWithoutHourlyRate(description?: string | null): string {
  return (description || "").split("\n")
    .filter(line => !line.trim().startsWith(PREFIX)).join("\n").trim();
}

export function withHourlyRate(description: string | null | undefined, value: unknown): string {
  const rate = parseHourlyRate(value);
  const text = descriptionWithoutHourlyRate(description);
  return [text, rate === null ? "" : `${PREFIX} ${rate.toFixed(2).replace(".", ",")} kr/t (kun denne vakten).`]
    .filter(Boolean).join("\n");
}

export function effectiveHourlyRate(shift: { beskrivelse?: string | null }, ordinaryRate: string | number): number {
  const rate = agreedHourlyRate(shift);
  if (rate !== null) return rate;
  const ordinary = Number(ordinaryRate);
  if (!Number.isFinite(ordinary) || ordinary < 0) throw new Error("Ugyldig vanlig timelønn");
  return ordinary;
}

export function calculateShiftPay(shift: PayShift, ordinaryRate: string | number): number {
  return Math.round(calculatePaidHours(shift.startTid, shift.sluttTid, shift) *
    effectiveHourlyRate(shift, ordinaryRate) * 100) / 100;
}

export type HourlyRatePatch = { avtalteTimelonn?: unknown };

export function normalizeShiftPayPatch<T extends { beskrivelse?: string | null; ansattId?: string | null } & HourlyRatePatch>(
  before: { beskrivelse?: string | null; ansattId?: string | null } | undefined,
  input: T,
): Omit<T, "avtalteTimelonn"> {
  const { avtalteTimelonn, ...patch } = input;
  const assignmentChanged = before?.ansattId && Object.prototype.hasOwnProperty.call(input, "ansattId") &&
    input.ansattId !== before.ansattId;
  if (Object.prototype.hasOwnProperty.call(input, "avtalteTimelonn")) {
    patch.beskrivelse = withHourlyRate(patch.beskrivelse ?? before?.beskrivelse, avtalteTimelonn);
  } else if (assignmentChanged) {
    // A rate agreed with the previous employee must not follow a reassignment.
    patch.beskrivelse = descriptionWithoutHourlyRate(patch.beskrivelse ?? before?.beskrivelse);
  } else if (Object.prototype.hasOwnProperty.call(input, "beskrivelse")) {
    agreedHourlyRate(patch); // reject malformed annotations instead of silently using ordinary pay
  }
  return patch;
}
