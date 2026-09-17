import type { Week39PlanResponse } from "@shared/week39";

/** Only a complete, conflict-free server preview may dismiss a saved plan. */
export function isWeek39Complete(plan: Week39PlanResponse | undefined): boolean {
  if (!plan || plan.conflicts.length || plan.rows.length !== 5) return false;
  const dates = new Set(plan.rows.map((row) => row.dato));
  return [21, 22, 23, 24, 25].every((day) => dates.has(`2026-09-${day}`)) &&
    plan.rows.every((row) => row.action === "reuse" && !!row.vaktId) &&
    new Set(plan.rows.map((row) => row.vaktId)).size === 5;
}