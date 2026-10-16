import type { Availability, User, Vakt } from "./schema";
import { matchesRegions, visibleShiftRegions } from "./regions";

export type AvailableShiftCandidate = {
  userId: string;
  name: string;
  stilling: string;
  region: string;
  hasRequested: boolean;
};

function interval(shift: Pick<Vakt, "dato" | "startTid" | "sluttTid">) {
  const minutes = (time: string) => {
    const [hours, mins] = time.split(":").map(Number);
    return hours * 60 + mins;
  };
  const day = Date.parse(`${shift.dato}T00:00:00Z`);
  const start = minutes(shift.startTid);
  const end = minutes(shift.sluttTid);
  return [day + start * 60_000, day + (end <= start ? end + 1440 : end) * 60_000];
}

export function availableShiftCandidates(
  shift: Vakt,
  users: Pick<User, "id" | "name" | "role" | "status" | "stilling" | "region">[],
  availability: Pick<Availability, "userId" | "date" | "status">[],
  shifts: Vakt[],
  requests: { ansattId: string }[] = [],
  blocked = false,
): AvailableShiftCandidate[] {
  if (blocked || shift.status !== "ledig" || shift.ansattId) return [];
  const available = new Set(availability
    .filter(row => row.date === shift.dato && row.status === "available")
    .map(row => row.userId));
  const requested = new Set(requests.map(row => row.ansattId));
  const [start, end] = interval(shift);
  const occupied = new Set(shifts.filter(other => {
    if (other.id === shift.id || !other.ansattId) return false;
    const [otherStart, otherEnd] = interval(other);
    return otherStart < end && otherEnd > start;
  }).map(other => other.ansattId));
  return users.filter(user =>
    user.role === "ansatt" && user.status?.toLowerCase() === "aktiv" &&
    available.has(user.id) && !occupied.has(user.id) &&
    matchesRegions(shift.region, visibleShiftRegions(user.region)),
  ).map(user => ({
    userId: user.id, name: user.name, stilling: user.stilling,
    region: user.region, hasRequested: requested.has(user.id),
  })).sort((a, b) => a.name.localeCompare(b.name, "nb"));
}
