import { z } from "zod";

export const WEEK39_EMPLOYEE_ID = "3b74c685-a5fa-4d82-a823-04c1aa339430";
export const WEEK39_EMPLOYEE_NAME = "Synne Heimli Van Der Meeren";
export const WEEK39_EMPLOYEE_EXTERNAL_ID = 9120;
export const WEEK39_KINDERGARTEN_ID = "478d91b4-3cdc-4801-a2a9-b6d569c980c6";
export const WEEK39_KINDERGARTEN_NAME = "Løvstakken Barnehage";
export const WEEK39_REGION = "Bergen";
export const WEEK39_PAID_HOURS = 7.5;

export const WEEK39_ROWS = [
  { dato: "2026-09-21", startTid: "09:00", sluttTid: "16:30" },
  { dato: "2026-09-22", startTid: "08:30", sluttTid: "16:00" },
  { dato: "2026-09-23", startTid: "08:00", sluttTid: "15:30" },
  { dato: "2026-09-24", startTid: "07:30", sluttTid: "15:00" },
  { dato: "2026-09-25", startTid: "09:00", sluttTid: "16:30" },
] as const;

export interface Week39Draft {
  key: "synne" | "sultan";
  employeeId: string;
  employeeName: string;
  employeeExternalId: number;
  kindergartenId: string;
  kindergartenName: string;
  region: string;
  betaltPause: boolean;
  agreedHours: string | null;
  paidHours: number;
  rows: readonly { dato: string; startTid: string; sluttTid: string }[];
}

export const SYNNE_WEEK39: Week39Draft = {
  key: "synne",
  employeeId: WEEK39_EMPLOYEE_ID,
  employeeName: WEEK39_EMPLOYEE_NAME,
  employeeExternalId: WEEK39_EMPLOYEE_EXTERNAL_ID,
  kindergartenId: WEEK39_KINDERGARTEN_ID,
  kindergartenName: WEEK39_KINDERGARTEN_NAME,
  region: WEEK39_REGION,
  betaltPause: true,
  agreedHours: "7.50",
  paidHours: WEEK39_PAID_HOURS,
  rows: WEEK39_ROWS,
};

export const SULTAN_WEEK39: Week39Draft = {
  key: "sultan",
  employeeId: "8570496d-4923-4cf6-8595-11946a251a5b",
  employeeName: "Sultan Duvarci",
  employeeExternalId: 9005,
  kindergartenId: "e9f276ce-dc0c-4a7b-a774-f83eec94e7db",
  kindergartenName: "Hjellemarka Fus Barnehage",
  region: "Os",
  betaltPause: false,
  agreedHours: null,
  paidHours: 7,
  rows: WEEK39_ROWS.map(({ dato }) => ({ dato, startTid: "07:45", sluttTid: "15:15" })),
};

export const week39ActionSchema = z.enum(["create", "reuse", "assign", "conflict"]);
export const week39PlanRowSchema = z.object({
  dato: z.string(),
  startTid: z.string(),
  sluttTid: z.string(),
  paidHours: z.number(),
  action: week39ActionSchema,
  vaktId: z.string().optional(),
  detail: z.string().optional(),
});
export const week39PlanResponseSchema = z.object({
  employee: z.object({ id: z.string(), name: z.string(), externalId: z.number() }),
  kindergarten: z.object({ id: z.string(), name: z.string() }),
  rows: z.array(week39PlanRowSchema),
  betaltPause: z.boolean(),
  totalPaidHours: z.number(),
  conflicts: z.array(z.string()),
  confirmationToken: z.string().nullable(),
});

export const week39ConfirmSchema = z.object({
  confirmationToken: z.string().min(1),
  confirmed: z.literal(true),
  vikarkode: z.enum(["KTV", "LTV", "LTV-NAV", "RES"]),
}).strict();

export const week39ApplyResponseSchema = z.object({
  created: z.number().int().nonnegative(),
  assigned: z.number().int().nonnegative(),
  reused: z.number().int().nonnegative(),
  vaktIds: z.array(z.string()),
  message: z.string(),
});

export type Week39Action = z.infer<typeof week39ActionSchema>;
export type Week39PlanRow = z.infer<typeof week39PlanRowSchema>;
export type Week39PlanResponse = z.infer<typeof week39PlanResponseSchema>;
export type Week39Confirm = z.infer<typeof week39ConfirmSchema>;
export type Week39ApplyResponse = z.infer<typeof week39ApplyResponseSchema>;