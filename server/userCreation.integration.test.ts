import assert from "node:assert/strict";
import test from "node:test";
import bcrypt from "bcryptjs";
import { pool } from "./db";
import {
  createEmployeeUser,
  parseCreateUserRequest,
  UserCreationError,
  type UserCreationDependencies,
} from "./userCreation";

/*
 * Explicitly opt-in and development-only. Every test uses an isolated schema
 * and synthetic identities, and cannot run against a production-looking URL.
 */
const databaseUrl = process.env.DATABASE_URL || "";
const productionDatabaseUrl = /(?:^|[./_-])prod(?:uction)?(?:[./?_-]|$)/i.test(databaseUrl);
const integrationEnabled =
  process.env.RUN_USER_CREATION_INTEGRATION === "1" &&
  process.env.NODE_ENV === "development" &&
  !productionDatabaseUrl;
const skip = integrationEnabled
  ? false
  : "user creation PostgreSQL integration tests require explicit development-only opt-in";

let schema = "";
let sequence = 0;

async function setup(): Promise<UserCreationDependencies> {
  schema = `user_creation_test_${process.pid}_${Date.now()}_${++sequence}`;
  await pool.query(`CREATE SCHEMA "${schema}"`);
  await pool.query(`
    CREATE TABLE "${schema}".users (
      id varchar PRIMARY KEY DEFAULT gen_random_uuid(), username text NOT NULL UNIQUE,
      password text NOT NULL, name text NOT NULL, email text, phone text, address text,
      kontonummer text, role text NOT NULL DEFAULT 'ansatt', region text NOT NULL,
      stilling text NOT NULL, timelonn decimal(10,2) NOT NULL, profile_image text,
      cv_file text, politiattest_file text, available boolean DEFAULT true,
      available_weekend boolean DEFAULT false, user_status text DEFAULT 'Aktiv',
      external_id integer
    );
    CREATE TABLE "${schema}".onboarding (
      id varchar PRIMARY KEY DEFAULT gen_random_uuid(), user_id varchar NOT NULL,
      item text NOT NULL, completed boolean DEFAULT false, completed_at timestamp
    );
  `);
  return {
    database: {
      connect: async () => {
        const client = await pool.connect();
        await client.query(`SET search_path TO "${schema}"`);
        return client;
      },
    },
  };
}

function payload(overrides: Record<string, unknown> = {}) {
  return parseCreateUserRequest({
    name: "Synthetic Employee",
    email: "synthetic.employee@example.test",
    phone: "",
    address: "",
    region: "Testregion",
    stilling: "Teststilling",
    externalId: 700001,
    timelonn: "200,00",
    password: "Synthetic!Passphrase42",
    ...overrides,
  });
}

async function counts() {
  const users = await pool.query(`SELECT count(*)::int AS count FROM "${schema}".users`);
  const onboarding = await pool.query(`SELECT count(*)::int AS count FROM "${schema}".onboarding`);
  return [users.rows[0].count, onboarding.rows[0].count];
}

test("creates ordinary employee with normalized pay, hashed password and onboarding", { skip }, async () => {
  try {
    const deps = await setup();
    const created = await createEmployeeUser(payload(), deps);
    assert.equal(created.timelonn, "200.00");
    assert.equal(created.role, "ansatt");
    assert.equal(created.status, "Aktiv");
    assert.equal("password" in created, false);
    assert.deepEqual(await counts(), [1, 5]);
    const stored = await pool.query(`SELECT password FROM "${schema}".users`);
    assert.notEqual(stored.rows[0].password, "Synthetic!Passphrase42");
    assert.equal(await bcrypt.compare("Synthetic!Passphrase42", stored.rows[0].password), true);
  } finally {
    if (schema) await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  }
});

test("accepts 200 and zero pay; rejects negative, malformed and over-precision pay", () => {
  assert.equal(payload({ timelonn: 200 }).timelonn, "200.00");
  assert.equal(payload({ timelonn: 0 }).timelonn, "0.00");
  for (const timelonn of [-1, "not-money", "200.001"]) {
    assert.throws(() => payload({ timelonn }), (error) =>
      error instanceof UserCreationError && error.status === 400 && /Timelønn/.test(error.message));
  }
});

test("concurrent duplicate email and employee ID create only one user", { skip }, async () => {
  try {
    const deps = await setup();
    const emailAttempts = await Promise.allSettled([
      createEmployeeUser(payload(), deps),
      createEmployeeUser(payload({
        name: "Other Synthetic Employee",
        email: " SYNTHETIC.EMPLOYEE@example.test ",
        externalId: 700002,
      }), deps),
    ]);
    assert.equal(emailAttempts.filter((result) => result.status === "fulfilled").length, 1);
    const emailFailure = emailAttempts.find((result): result is PromiseRejectedResult => result.status === "rejected");
    assert.equal(
      emailFailure?.reason instanceof UserCreationError &&
      emailFailure.reason.status === 409 &&
      emailFailure.reason.existingUsers?.length === 1,
      true,
    );

    const idAttempts = await Promise.allSettled([
      createEmployeeUser(payload({
        name: "Third Synthetic Employee",
        email: "third.synthetic@example.test",
        externalId: 700003,
      }), deps),
      createEmployeeUser(payload({
        name: "Fourth Synthetic Employee",
        email: "fourth.synthetic@example.test",
        externalId: 700003,
      }), deps),
    ]);
    assert.equal(idAttempts.filter((result) => result.status === "fulfilled").length, 1);
    const idFailure = idAttempts.find((result): result is PromiseRejectedResult => result.status === "rejected");
    assert.equal(
      idFailure?.reason instanceof UserCreationError &&
      idFailure.reason.status === 409 &&
      idFailure.reason.existingUsers?.length === 1,
      true,
    );
    assert.deepEqual(await counts(), [2, 10]);
  } finally {
    if (schema) await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  }
});

test("rolls back both user and onboarding after a pre-commit failure", { skip }, async () => {
  try {
    const deps = await setup();
    await assert.rejects(
      createEmployeeUser(payload(), {
        ...deps,
        beforeCommit: async () => {
          throw new Error("synthetic rollback");
        },
      }),
      /synthetic rollback/,
    );
    assert.deepEqual(await counts(), [0, 0]);
  } finally {
    if (schema) await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await pool.end();
  }
});