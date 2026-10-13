import { eq } from "drizzle-orm";
import { barnehager, vaktInteresser, varsler, type Vakt, type InsertVarsel } from "@shared/schema";
import type { db } from "./db";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Assignment = Pick<Vakt, "id" | "status" | "ansattId" | "barnehageId" | "dato" | "startTid" | "sluttTid">;

export class ShiftRequestError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
  }
}

export function requestWasResolved(before: Assignment, after: Assignment): boolean {
  return ["ledig", "venter"].includes(before.status) &&
    ["tildelt", "godkjent"].includes(after.status) && !!after.ansattId;
}

export function buildUnsuccessfulRequestNotices(
  before: Assignment,
  after: Assignment,
  requests: { ansattId: string }[],
  kindergartenName: string,
): InsertVarsel[] {
  if (!requestWasResolved(before, after)) return [];
  const recipients = new Set(requests.map(request => request.ansattId));
  recipients.delete(after.ansattId!);
  const date = new Date(`${after.dato}T12:00:00Z`).toLocaleDateString("nb-NO", {
    day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Oslo",
  });
  return Array.from(recipients).map(userId => ({
    userId,
    title: "Vakten er tildelt en annen",
    message: `Vakten hos ${kindergartenName} ${date}, kl. ${after.startTid.slice(0, 5)}–${after.sluttTid.slice(0, 5)}, er tildelt en annen ansatt. Forespørselen din ble ikke godkjent. Du skal ikke møte på denne vakten.`,
    type: "vakt",
    read: false,
    link: "/",
  }));
}

// Called while holding the shift's row lock. The assignment and all visible
// rejection notices either commit together or roll back together.
export async function persistUnsuccessfulRequestNotices(
  tx: Transaction, before: Assignment, after: Assignment,
): Promise<InsertVarsel[]> {
  if (!requestWasResolved(before, after)) return [];
  const requests = await tx.select().from(vaktInteresser).where(eq(vaktInteresser.vaktId, after.id));
  if (!requests.some(request => request.ansattId !== after.ansattId)) return [];
  const [kindergarten] = await tx.select().from(barnehager).where(eq(barnehager.id, after.barnehageId));
  const notices = buildUnsuccessfulRequestNotices(before, after, requests, kindergarten?.name || "barnehagen");
  if (notices.length) await tx.insert(varsler).values(notices);
  return notices;
}
