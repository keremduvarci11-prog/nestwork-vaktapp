export const CRON_TIME_ZONE = "Europe/Oslo";

type LocalDateTimeParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

const osloDateTimeFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: CRON_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

function partsInOslo(date: Date): LocalDateTimeParts {
  const parts = Object.fromEntries(
    osloDateTimeFormatter
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)]),
  );

  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour: parts.hour,
    minute: parts.minute,
    second: parts.second,
  };
}

function sameLocalDateTime(a: LocalDateTimeParts, b: LocalDateTimeParts): boolean {
  return (
    a.year === b.year &&
    a.month === b.month &&
    a.day === b.day &&
    a.hour === b.hour &&
    a.minute === b.minute &&
    a.second === b.second
  );
}

function parseLocalDateTime(date: string, time: string): LocalDateTimeParts {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const timeMatch = /^(\d{2}):(\d{2})(?::(\d{2}))?/.exec(time);
  if (!dateMatch || !timeMatch) {
    throw new RangeError(`Invalid local date/time: ${date} ${time}`);
  }

  const parts = {
    year: Number(dateMatch[1]),
    month: Number(dateMatch[2]),
    day: Number(dateMatch[3]),
    hour: Number(timeMatch[1]),
    minute: Number(timeMatch[2]),
    second: Number(timeMatch[3] ?? 0),
  };
  const validationDate = new Date(
    Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second),
  );
  if (
    validationDate.getUTCFullYear() !== parts.year ||
    validationDate.getUTCMonth() + 1 !== parts.month ||
    validationDate.getUTCDate() !== parts.day ||
    validationDate.getUTCHours() !== parts.hour ||
    validationDate.getUTCMinutes() !== parts.minute ||
    validationDate.getUTCSeconds() !== parts.second
  ) {
    throw new RangeError(`Invalid local date/time: ${date} ${time}`);
  }
  return parts;
}

/**
 * Converts a wall-clock time in Europe/Oslo to its absolute instant.
 * If the clock is repeated when DST ends, the first occurrence is used.
 * A wall-clock time skipped by the spring DST transition is rejected.
 */
export function osloDateTimeToDate(date: string, time: string): Date {
  const wanted = parseLocalDateTime(date, time);
  const wallClockAsUtc = Date.UTC(
    wanted.year,
    wanted.month - 1,
    wanted.day,
    wanted.hour,
    wanted.minute,
    wanted.second,
  );

  const possibleOffsets = new Set<number>();
  for (let hours = -36; hours <= 36; hours += 6) {
    const probe = new Date(wallClockAsUtc + hours * 60 * 60 * 1000);
    const local = partsInOslo(probe);
    const localAsUtc = Date.UTC(
      local.year,
      local.month - 1,
      local.day,
      local.hour,
      local.minute,
      local.second,
    );
    possibleOffsets.add(localAsUtc - probe.getTime());
  }

  const matches = Array.from(possibleOffsets)
    .map((offset) => new Date(wallClockAsUtc - offset))
    .filter((candidate) => sameLocalDateTime(partsInOslo(candidate), wanted))
    .sort((a, b) => a.getTime() - b.getTime());

  if (matches.length === 0) {
    throw new RangeError(`Local time does not exist in ${CRON_TIME_ZONE}: ${date} ${time}`);
  }
  return matches[0];
}

export function tomorrowDateInOslo(now: Date): string {
  const local = partsInOslo(now);
  const tomorrow = new Date(Date.UTC(local.year, local.month - 1, local.day + 1));
  return [
    tomorrow.getUTCFullYear(),
    String(tomorrow.getUTCMonth() + 1).padStart(2, "0"),
    String(tomorrow.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

export function isShiftEndReminderDue(
  now: Date,
  shiftDate: string,
  shiftEndTime: string,
): boolean {
  const shiftEnd = osloDateTimeToDate(shiftDate, shiftEndTime);
  const minutesAfterEnd = (now.getTime() - shiftEnd.getTime()) / (1000 * 60);
  return minutesAfterEnd >= 15 && minutesAfterEnd < 20;
}