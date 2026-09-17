import bcrypt from "bcryptjs";
import type { Pool, PoolClient } from "pg";
import { pool } from "./db";
import {
  createUserRequestSchema,
  type CreateUserRequest,
} from "@shared/createUser";

const ONBOARDING_ITEMS = [
  "Bytt passord",
  "Last opp profilbilde",
  "Last opp CV",
  "Last opp politiattest",
  "Signert kontrakt",
];

export type SafeCreatedUser = {
  id: string;
  username: string;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  kontonummer: string | null;
  role: string;
  region: string;
  stilling: string;
  timelonn: string;
  profileImage: string | null;
  cvFile: string | null;
  politiattestFile: string | null;
  available: boolean | null;
  availableWeekend: boolean | null;
  status: string | null;
  externalId: number | null;
};

type ExistingUser = Pick<SafeCreatedUser, "id" | "name" | "email" | "externalId">;

export class UserCreationError extends Error {
  constructor(
    public readonly status: 400 | 409,
    message: string,
    public readonly existingUsers?: ExistingUser[],
  ) {
    super(message);
  }
}

export type UserCreationDependencies = {
  database: Pick<Pool, "connect">;
  hashPassword?: (password: string) => Promise<string>;
  beforeCommit?: () => Promise<void>;
};

function derivedUsername(name: string): string {
  const parts = name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  return `${parts[0] || "ansatt"}${parts.at(-1) || ""}`.slice(0, 20) || "ansatt";
}

async function chooseUsername(client: PoolClient, requested: string): Promise<string> {
  for (let suffix = 0; ; suffix += 1) {
    const suffixText = suffix === 0 ? "" : String(suffix + 1);
    const candidate = `${requested.slice(0, Math.max(1, 30 - suffixText.length))}${suffixText}`;
    const result = await client.query(
      "SELECT 1 FROM users WHERE lower(username) = lower($1) LIMIT 1",
      [candidate],
    );
    if (result.rowCount === 0) return candidate;
  }
}

function mapSafeUser(row: Record<string, unknown>): SafeCreatedUser {
  return {
    id: String(row.id),
    username: String(row.username),
    name: String(row.name),
    email: row.email == null ? null : String(row.email),
    phone: row.phone == null ? null : String(row.phone),
    address: row.address == null ? null : String(row.address),
    kontonummer: row.kontonummer == null ? null : String(row.kontonummer),
    role: String(row.role),
    region: String(row.region),
    stilling: String(row.stilling),
    timelonn: String(row.timelonn),
    profileImage: row.profile_image == null ? null : String(row.profile_image),
    cvFile: row.cv_file == null ? null : String(row.cv_file),
    politiattestFile: row.politiattest_file == null ? null : String(row.politiattest_file),
    available: row.available == null ? null : Boolean(row.available),
    availableWeekend: row.available_weekend == null ? null : Boolean(row.available_weekend),
    status: row.user_status == null ? null : String(row.user_status),
    externalId: row.external_id == null ? null : Number(row.external_id),
  };
}

export function parseCreateUserRequest(body: unknown): CreateUserRequest {
  const parsed = createUserRequestSchema.safeParse(body);
  if (!parsed.success) {
    throw new UserCreationError(400, parsed.error.issues[0]?.message || "Ugyldige brukerdata");
  }
  return parsed.data;
}

export async function createEmployeeUser(
  input: CreateUserRequest,
  dependencies: UserCreationDependencies = { database: pool },
): Promise<SafeCreatedUser> {
  const hashedPassword = await (dependencies.hashPassword || ((password) => bcrypt.hash(password, 10)))(input.password);
  const client = await dependencies.database.connect();
  try {
    await client.query("BEGIN");
    await client.query("LOCK TABLE users IN SHARE ROW EXCLUSIVE MODE");

    const collisionConditions = ["lower(trim(email)) = lower(trim($1))"];
    const values: unknown[] = [input.email];
    if (input.externalId !== undefined) {
      values.push(input.externalId);
      collisionConditions.push(`external_id = $${values.length}`);
    }
    if (input.username) {
      values.push(input.username);
      collisionConditions.push(`lower(username) = lower($${values.length})`);
    }
    const collisions = await client.query(
      `SELECT id, name, email, external_id
       FROM users
       WHERE ${collisionConditions.join(" OR ")}`,
      values,
    );
    if (collisions.rows.length > 0) {
      await client.query("ROLLBACK");
      throw new UserCreationError(
        409,
        "En bruker med samme e-post, ansattnummer eller brukernavn finnes allerede",
        collisions.rows.map((row) => ({
          id: String(row.id),
          name: String(row.name),
          email: row.email == null ? null : String(row.email),
          externalId: row.external_id == null ? null : Number(row.external_id),
        })),
      );
    }

    const username = input.username || await chooseUsername(client, derivedUsername(input.name));
    const inserted = await client.query(
      `INSERT INTO users
        (username, password, name, email, phone, address, kontonummer, role, region, stilling,
         timelonn, available, available_weekend, user_status, external_id)
       VALUES ($1, $2, $3, $4, $5, $6, '', $7, $8, $9, $10, true, false, 'Aktiv', $11)
       RETURNING *`,
      [
        username, hashedPassword, input.name, input.email, input.phone, input.address,
        input.role, input.region, input.stilling, input.timelonn, input.externalId ?? null,
      ],
    );
    const created = inserted.rows[0];
    for (const item of ONBOARDING_ITEMS) {
      await client.query(
        "INSERT INTO onboarding (user_id, item, completed) VALUES ($1, $2, false)",
        [created.id, item],
      );
    }
    if (dependencies.beforeCommit) await dependencies.beforeCommit();
    await client.query("COMMIT");
    return mapSafeUser(created);
  } catch (error) {
    if (!(error instanceof UserCreationError && error.status === 409)) {
      await client.query("ROLLBACK").catch(() => undefined);
    }
    throw error;
  } finally {
    client.release();
  }
}