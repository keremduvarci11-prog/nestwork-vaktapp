import type { Express, NextFunction, Request, Response } from "express";
import { createHmac, timingSafeEqual } from "node:crypto";
import type { PoolClient, QueryResultRow } from "pg";
import { pool } from "./db";
import { notifyUser } from "./notifications";
import { wakeSheetSyncWorker } from "./sheetSync";
import { calculatePaidHours, shiftPaidTerms } from "@shared/shiftHours";
import {
  SYNNE_WEEK39,
  SULTAN_WEEK39,
  type Week39Draft,
  week39ConfirmSchema,
  type Week39Action,
  type Week39ApplyResponse,
  type Week39PlanResponse,
  type Week39PlanRow,
} from "@shared/week39";

const WEEK39_SECRET = process.env.SESSION_SECRET;
const TOKEN_TTL_MS = 15 * 60 * 1000;
const ASSIGNED_STATUSES = new Set(["tildelt", "godkjent"]);

export interface Week39Dependencies {
  db: Pick<typeof pool, "connect">;
  notifyUser: typeof notifyUser;
  wakeSheetSyncWorker: typeof wakeSheetSyncWorker;
  /** Test-only failure injection, before the transaction is committed. */
  beforeCommit?: () => Promise<void>;
}

const productionDependencies: Week39Dependencies = {
  db: pool,
  notifyUser,
  wakeSheetSyncWorker,
};

export interface Week39Shift {
  id: string;
  barnehageId: string;
  dato: string;
  startTid: string;
  sluttTid: string;
  vikarkode: string;
  status: string;
  ansattId: string | null;
  region: string;
  betaltPause: boolean;
  avtalteBetalteTimer: string | number | null;
}

interface Week39Identity {
  employee: { id: string; name: string; externalId: number };
  kindergarten: { id: string; name: string };
  conflicts: string[];
}

function shortTime(value: string): string {
  return String(value || "").slice(0, 5);
}

function minutes(value: string): number {
  const [hours, mins] = shortTime(value).split(":").map(Number);
  return Number.isFinite(hours) && Number.isFinite(mins) ? hours * 60 + mins : -1;
}

function overlaps(a: Week39Shift, b: { dato: string; startTid: string; sluttTid: string }): boolean {
  if (a.dato !== b.dato) return false;
  return minutes(a.startTid) < minutes(b.sluttTid) && minutes(b.startTid) < minutes(a.sluttTid);
}

function hasExpectedPaidTerms(shift: Week39Shift, config: Week39Draft): boolean {
  const paidHours = calculatePaidHours(shift.startTid, shift.sluttTid, {
    betaltPause: shift.betaltPause,
    avtalteBetalteTimer: shift.avtalteBetalteTimer,
  });
  return shift.betaltPause === config.betaltPause && Math.abs(paidHours - config.paidHours) < 0.001;
}

function exactTerms(shift: Week39Shift, draft: Week39Draft["rows"][number], config: Week39Draft): boolean {
  return shift.barnehageId === config.kindergartenId &&
    shift.dato === draft.dato &&
    shortTime(shift.startTid) === draft.startTid &&
    shortTime(shift.sluttTid) === draft.sluttTid &&
    hasExpectedPaidTerms(shift, config);
}

function conflictDetail(draft: Week39Draft["rows"][number], message: string): string {
  return `${draft.dato} ${draft.startTid}-${draft.sluttTid}: ${message}`;
}

/**
 * Pure plan evaluator. It intentionally treats a code-less preview as a
 * review of the paid/time terms; the final code is checked again on POST.
 */
export function evaluateWeek39Rows(
  shifts: Week39Shift[],
  vikarkode?: string,
  identityConflicts: string[] = [],
  config: Week39Draft = SYNNE_WEEK39,
): { rows: Week39PlanRow[]; conflicts: string[] } {
  const conflicts = [...identityConflicts];
  const rows = config.rows.map((draft): Week39PlanRow => {
    const base = {
      dato: draft.dato,
      startTid: draft.startTid,
      sluttTid: draft.sluttTid,
      paidHours: config.paidHours,
    };

    if (identityConflicts.length) {
      const detail = identityConflicts.join(" ");
      conflicts.push(conflictDetail(draft, detail));
      return { ...base, action: "conflict" as Week39Action, detail };
    }

    const terms = shifts.filter((shift) => exactTerms(shift, draft, config));
    const codeMismatch = terms.filter((shift) => vikarkode !== undefined && shift.vikarkode !== vikarkode);
    const exactCode = terms.filter((shift) => vikarkode === undefined || shift.vikarkode === vikarkode);
    let action: Week39Action = "create";
    let selected: Week39Shift | undefined;
    let detail: string | undefined;

    if (terms.length > 1) {
      action = "conflict";
      detail = "flere eksisterende vakter med samme dato, tid og betalte vilkår";
    } else if (codeMismatch.length) {
      action = "conflict";
      detail = `eksisterende vakt har vikarkode ${codeMismatch[0].vikarkode}, ikke valgt kode`;
    } else if (exactCode.length === 1) {
      selected = exactCode[0];
      if (selected.ansattId === config.employeeId && ASSIGNED_STATUSES.has(selected.status)) {
        action = "reuse";
      } else if (selected.status === "ledig" && !selected.ansattId) {
        action = "assign";
      } else if (selected.ansattId !== config.employeeId) {
        action = "conflict";
        detail = "eksakt vakt er allerede knyttet til en annen ansatt";
      } else {
        action = "conflict";
        detail = `eksakt vakt har status ${selected.status} og kan ikke gjenbrukes trygt`;
      }
    }

    // A second overlapping row is unsafe even if one exact row was found.
    const candidateId = selected?.id;
    const competing = shifts.filter((shift) =>
      shift.id !== candidateId &&
      shift.dato === draft.dato &&
      (shift.barnehageId === config.kindergartenId || shift.ansattId === config.employeeId) &&
      // Week 39 is a fixed one-row-per-day draft. A same-day row for either
      // party is ambiguous even when its clock range does not overlap.
      (overlaps(shift, draft) || shift.dato === draft.dato),
    );
    if (competing.length && action !== "conflict") {
      action = "conflict";
      detail = "overlappende eller avvikende vakt samme dag for ansatt eller barnehage";
    }

    if (action === "conflict") {
      const message = conflictDetail(draft, detail || "vakt kan ikke behandles trygt");
      conflicts.push(message);
      return {
        ...base,
        action,
        ...(selected?.id ? { vaktId: selected.id } : {}),
        detail,
      };
    }

    return {
      ...base,
      action,
      ...(selected?.id ? { vaktId: selected.id } : {}),
      ...(detail ? { detail } : {}),
    };
  });

  return { rows, conflicts: Array.from(new Set(conflicts)) };
}

function tokenPayload(adminId: string, vikarkode: string | undefined, config: Week39Draft) {
  return {
    v: 1,
    adminId,
    draft: config,
    vikarkode: vikarkode || null,
    expiresAt: Date.now() + TOKEN_TTL_MS,
  };
}

function signTokenPayload(payload: ReturnType<typeof tokenPayload>): string {
  if (!WEEK39_SECRET) throw new Error("WEEK39_CONFIRMATION_SECRET_MISSING");
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", WEEK39_SECRET).update(encoded).digest("base64url");
  return `${encoded}.${signature}`;
}

export function createWeek39ConfirmationToken(adminId: string, vikarkode?: string, config: Week39Draft = SYNNE_WEEK39): string {
  return signTokenPayload(tokenPayload(adminId, vikarkode, config));
}

function verifyWeek39ConfirmationToken(token: string, adminId: string, config: Week39Draft): ReturnType<typeof tokenPayload> | null {
  if (!WEEK39_SECRET) return null;
  const [encoded, signature, extra] = token.split(".");
  if (!encoded || !signature || extra !== undefined) return null;
  const expected = createHmac("sha256", WEEK39_SECRET).update(encoded).digest("base64url");
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length || !timingSafeEqual(actualBuffer, expectedBuffer)) return null;
  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
    if (payload.adminId !== adminId || payload.v !== 1 ||
        !Number.isFinite(payload.expiresAt) || payload.expiresAt < Date.now()) return null;
    if (JSON.stringify(payload.draft) !== JSON.stringify(config)) return null;
    return payload;
  } catch {
    return null;
  }
}

async function loadIdentity(client: PoolClient, lock: boolean, config: Week39Draft): Promise<Week39Identity> {
  const lockClause = lock ? " FOR UPDATE" : "";
  const employeeResult = await client.query<QueryResultRow>(
    `SELECT id, name, external_id, role, region, user_status
       FROM users
      WHERE id = $1 OR external_id = $2 OR (lower(name) = lower($3) AND region = $4)${lockClause}`,
    [config.employeeId, config.employeeExternalId, config.employeeName, config.region],
  );
  const kindergartenResult = await client.query<QueryResultRow>(
    `SELECT id, name, region, aktiv
       FROM barnehager
      WHERE id = $1 OR (lower(name) = lower($2) AND region = $3)${lockClause}`,
    [config.kindergartenId, config.kindergartenName, config.region],
  );
  const conflicts: string[] = [];
  const employees = employeeResult.rows;
  const kindergartens = kindergartenResult.rows;
  const employee = employees.length === 1 && employees[0].id === config.employeeId
    ? employees[0] : undefined;
  const kindergarten = kindergartens.length === 1 && kindergartens[0].id === config.kindergartenId
    ? kindergartens[0] : undefined;

  if (!employee) conflicts.push("Ansattidentiteten er ikke entydig.");
  else {
    if (employee.name !== config.employeeName ||
        Number(employee.external_id) !== config.employeeExternalId ||
        employee.role !== "ansatt" || employee.region !== config.region ||
        employee.user_status !== "Aktiv") {
      conflicts.push(`${config.employeeName} er ikke aktiv ansatt i ${config.region} med ansattnummer ${config.employeeExternalId}.`);
    }
  }
  if (!kindergarten) conflicts.push("Barnehageidentiteten er ikke entydig.");
  else if (kindergarten.name !== config.kindergartenName ||
           kindergarten.region !== config.region || kindergarten.aktiv !== true) {
    conflicts.push(`${config.kindergartenName} er ikke aktiv i ${config.region}.`);
  }

  return {
    employee: {
      id: employee?.id || config.employeeId,
      name: employee?.name || config.employeeName,
      externalId: Number(employee?.external_id || config.employeeExternalId),
    },
    kindergarten: {
      id: kindergarten?.id || config.kindergartenId,
      name: kindergarten?.name || config.kindergartenName,
    },
    conflicts,
  };
}

async function loadShifts(client: PoolClient, lock: boolean, config: Week39Draft): Promise<Week39Shift[]> {
  const lockClause = lock ? " FOR UPDATE" : "";
  const result = await client.query<Week39Shift>(
    `SELECT id, barnehage_id AS "barnehageId", dato::text AS dato,
            start_tid::text AS "startTid", slutt_tid::text AS "sluttTid",
            vikarkode, status, ansatt_id AS "ansattId", region,
            betalt_pause AS "betaltPause",
            avtalte_betalte_timer::text AS "avtalteBetalteTimer"
       FROM vakter
      WHERE dato BETWEEN $1::date AND $2::date
        AND (barnehage_id = $3 OR ansatt_id = $4)${lockClause}`,
    [config.rows[0].dato, config.rows[config.rows.length - 1].dato, config.kindergartenId, config.employeeId],
  );
  return result.rows;
}

async function hasSheetSyncTrigger(client: PoolClient): Promise<boolean> {
  const result = await client.query(
    `SELECT 1
       FROM pg_trigger
      WHERE tgrelid = 'vakter'::regclass
        AND tgname = 'vakter_sheet_sync_outbox'
        AND tgenabled IN ('O', 'A')
        AND NOT tgisinternal
      LIMIT 1`,
  );
  return result.rows.length === 1;
}

async function makePlan(client: PoolClient, code: string | undefined, lock: boolean, config: Week39Draft): Promise<Week39PlanResponse> {
  const identity = await loadIdentity(client, lock, config);
  const shifts = await loadShifts(client, lock, config);
  const evaluated = evaluateWeek39Rows(shifts, code, identity.conflicts, config);
  const confirmationToken = evaluated.conflicts.length ? null : undefined;
  return {
    employee: identity.employee,
    kindergarten: identity.kindergarten,
    rows: evaluated.rows,
    betaltPause: config.betaltPause,
    totalPaidHours: config.rows.length * config.paidHours,
    conflicts: evaluated.conflicts,
    confirmationToken: confirmationToken === null ? null : "",
  };
}

export async function previewWeek39Plan(
  adminId: string,
  code?: string,
  dependencies: Week39Dependencies = productionDependencies,
  config: Week39Draft = SYNNE_WEEK39,
): Promise<Week39PlanResponse> {
  const client = await dependencies.db.connect();
  try {
    await client.query("BEGIN READ ONLY");
    const plan = await makePlan(client, code, false, config);
    await client.query("COMMIT");
    if (!WEEK39_SECRET) {
      const detail = "Bekreftelsestoken er ikke konfigurert.";
      plan.conflicts = [detail];
      plan.rows = plan.rows.map((row) => ({ ...row, action: "conflict", detail }));
      plan.confirmationToken = null;
    } else if (!plan.conflicts.length) {
      plan.confirmationToken = createWeek39ConfirmationToken(adminId, code, config);
    }
    return plan;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function applyWeek39Plan(
  adminId: string,
  code: string,
  token: string,
  dependencies: Week39Dependencies = productionDependencies,
  config: Week39Draft = SYNNE_WEEK39,
): Promise<Week39ApplyResponse | { conflicts: string[]; message: string }> {
  const reviewed = verifyWeek39ConfirmationToken(token, adminId, config);
  if (!reviewed || (reviewed.vikarkode && reviewed.vikarkode !== code)) {
    return { conflicts: ["Bekreftelsestoken er ugyldig eller utløpt."], message: "Forhåndsvisningen må gjennomgås på nytt." };
  }

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const client = await dependencies.db.connect();
    try {
      await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
      // Ordinary shift writers acquire ROW EXCLUSIVE. This table lock makes
      // the recheck and the create/assign decision a single writer critical
      // section, including the otherwise unobservable "no matching row"
      // case.
      await client.query("LOCK TABLE vakter IN SHARE ROW EXCLUSIVE MODE");
      if (!(await hasSheetSyncTrigger(client))) {
        await client.query("ROLLBACK");
        return {
          conflicts: ["Ark-synkkøens vakter-trigger mangler; ingen endringer ble gjort."],
          message: "Uke 39-planen ble ikke lagret fordi arksynk ikke er klargjort.",
        };
      }
       const plan = await makePlan(client, code, true, config);
      if (plan.conflicts.length) {
        await client.query("COMMIT");
        return { conflicts: plan.conflicts, message: "Uke 39-planen ble ikke lagret fordi den har konflikter." };
      }

      const ids: string[] = [];
      const notificationRows: Week39PlanRow[] = [];
      let created = 0;
      let assigned = 0;
      let reused = 0;
      for (const row of plan.rows) {
        if (row.action === "reuse") {
          reused += 1;
          ids.push(row.vaktId!);
          continue;
        }
        if (row.action === "assign") {
          const updated = await client.query<{ id: string }>(
            `UPDATE vakter
                SET ansatt_id = $1, status = 'tildelt'
              WHERE id = $2 AND status = 'ledig' AND ansatt_id IS NULL
              RETURNING id`,
            [config.employeeId, row.vaktId],
          );
          if (updated.rows.length !== 1) {
            throw Object.assign(new Error("WEEK39_CONCURRENCY"), { code: "40001" });
          }
          assigned += 1;
          ids.push(updated.rows[0].id);
          notificationRows.push(row);
          continue;
        }
        const paidTerms = shiftPaidTerms({
          ...row, barnehageId: config.kindergartenId,
          betaltPause: config.betaltPause, avtalteBetalteTimer: config.agreedHours,
        });
        const inserted = await client.query<{ id: string }>(
          `INSERT INTO vakter
             (barnehage_id, dato, start_tid, slutt_tid, vikarkode, status,
              ansatt_id, region, beskrivelse, trekk_pause, betalt_pause, avtalte_betalte_timer)
           VALUES ($1, $2::date, $3::time, $4::time, $5, 'tildelt',
                    $6, $7, NULL, $8, $9, $10)
           RETURNING id`,
          [config.kindergartenId, row.dato, row.startTid, row.sluttTid, code,
            config.employeeId, config.region, paidTerms.trekkPause,
            paidTerms.betaltPause, config.agreedHours],
        );
        created += 1;
        assigned += 1;
        ids.push(inserted.rows[0].id);
        notificationRows.push(row);
      }
      if (dependencies.beforeCommit) await dependencies.beforeCommit();
      await client.query("COMMIT");
      if (created || assigned) dependencies.wakeSheetSyncWorker();

      for (const row of notificationRows) {
        try {
          await dependencies.notifyUser(
            config.employeeId,
            "Du har fatt en ny vakt",
            `Nestwork Admin har tildelt deg en vakt ${row.dato} hos ${config.kindergartenName} (${row.startTid} - ${row.sluttTid}). Husk a godkjenne.`,
            "tildeling",
            "/mine-vakter",
          );
        } catch (error) {
          console.error("[Week39] Feil ved varsling:", error);
        }
      }
      return {
        created,
        assigned,
        reused,
        vaktIds: ids,
        message: created || assigned
          ? "Uke 39-planen er opprettet og tildelt."
          : "Uke 39-planen var allerede opprettet; ingen endringer ble gjort.",
      };
    } catch (error: any) {
      await client.query("ROLLBACK").catch(() => undefined);
      if (error?.code === "40001" && attempt < 2) continue;
      throw error;
    } finally {
      client.release();
    }
  }
  throw new Error("WEEK39_CONCURRENCY");
}

export function registerWeek39Routes(
  app: Express,
  requireAdmin: (req: Request, res: Response, next: NextFunction) => any,
): void {
  for (const config of [SYNNE_WEEK39, SULTAN_WEEK39]) {
  const endpoint = config.key === "synne" ? "/api/admin/week39-plan" : "/api/admin/week39-plan/sultan";
  app.get(endpoint, requireAdmin, async (req, res) => {
    try {
      const rawCode = req.query.vikarkode;
      const code = typeof rawCode === "string" && rawCode ? rawCode : undefined;
      if (code && !["KTV", "LTV", "LTV-NAV", "RES"].includes(code)) {
        return res.status(400).json({ message: "Ugyldig vikarkode" });
      }
      const plan = await previewWeek39Plan((req as any)._userId, code, productionDependencies, config);
      res.json(plan);
    } catch (error) {
      console.error("[Week39] Preview feilet:", error);
      res.status(500).json({ message: "Kunne ikke forhåndsvise uke 39-planen." });
    }
  });

  app.post(endpoint, requireAdmin, async (req, res) => {
    const parsed = week39ConfirmSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
    try {
      const result = await applyWeek39Plan((req as any)._userId, parsed.data.vikarkode, parsed.data.confirmationToken, productionDependencies, config);
      if ("conflicts" in result) return res.status(409).json(result);
      res.json(result);
    } catch (error) {
      console.error("[Week39] Apply feilet:", error);
      res.status(500).json({ message: "Kunne ikke lagre uke 39-planen." });
    }
  });
  }
}