import { apiRequest } from "./queryClient";

export type AvailabilityStatus = "available" | "unavailable";

export function nextAvailabilityStatus(status?: AvailabilityStatus): AvailabilityStatus | undefined {
  return status === undefined ? "available" : status === "available" ? "unavailable" : undefined;
}

export function canEditAvailability({
  ready, busy, isPast, isWeekend, isBlocked, hasShift,
}: {
  ready: boolean; busy: boolean; isPast: boolean; isWeekend: boolean; isBlocked: boolean; hasShift: boolean;
}): boolean {
  return ready && !busy && !isPast && !isWeekend && !isBlocked && !hasShift;
}

export const availabilityMonthQueryKey = (date: string) =>
  ["/api/availability/me", date.slice(0, 7)] as const;

export async function saveAvailability({ date, status }: { date: string; status?: AvailabilityStatus }) {
  return status === undefined
    ? apiRequest("DELETE", `/api/availability/me/${date}`)
    : apiRequest("PUT", "/api/availability/me", { date, status });
}