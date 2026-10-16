import { eq } from "drizzle-orm";
import { barnehager, vaktInteresser, varsler, type Vakt, type InsertVarsel } from "@shared/schema";
import type { db } from "./db";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Shift = Pick<Vakt, "id" | "ansattId" | "status" | "dato" | "startTid" | "sluttTid" | "barnehageId">;

export function shiftTimeChanged(before: Shift, after: Shift): boolean {
  return before.startTid.slice(0, 5) !== after.startTid.slice(0, 5) ||
    before.sluttTid.slice(0, 5) !== after.sluttTid.slice(0, 5);
}

export function buildShiftTimeNotices(
  before: Shift, after: Shift, requests: { ansattId: string }[], kindergarten: string,
): InsertVarsel[] {
  if (!shiftTimeChanged(before, after)) return [];
  // A newly assigned employee receives the ordinary assignment notification,
  // rather than an additional change notice about someone else's old shift.
  if (before.ansattId !== after.ansattId) return [];
  const recipients = after.ansattId
    ? [after.ansattId]
    : ["ledig", "venter"].includes(after.status)
      ? Array.from(new Set(requests.map(request => request.ansattId)))
      : [];
  const date = new Date(`${after.dato}T12:00:00Z`).toLocaleDateString("nb-NO", {
    day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Oslo",
  });
  return recipients.map(userId => ({
    userId,
    title: after.ansattId
      ? "Vakten din har fått nye tider"
      : "Vakten du har søkt på har fått nye tider",
    message: `${kindergarten}, ${date}. Trykk her for å se de nye tidene.${after.ansattId ? "" : " Forespørselen er ikke en tildeling. Du skal ikke møte uten bekreftet tildeling."}`,
    type: "vakt",
    read: false,
    link: after.ansattId ? "/mine-vakter" : "/",
  }));
}

export async function persistShiftTimeNotices(
  tx: Transaction, before: Shift, after: Shift,
): Promise<InsertVarsel[]> {
  if (!shiftTimeChanged(before, after) || before.ansattId !== after.ansattId) return [];
  const requests = !after.ansattId && ["ledig", "venter"].includes(after.status)
    ? await tx.select().from(vaktInteresser).where(eq(vaktInteresser.vaktId, after.id))
    : [];
  if (!after.ansattId && requests.length === 0) return [];
  const [kindergarten] = await tx.select().from(barnehager).where(eq(barnehager.id, after.barnehageId));
  const notices = buildShiftTimeNotices(before, after, requests, kindergarten?.name || "barnehagen");
  if (notices.length) await tx.insert(varsler).values(notices);
  return notices;
}
