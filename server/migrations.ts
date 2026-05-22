import { pool } from "./db";

export async function runMigrations() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS personalregler_godkjenning (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id VARCHAR NOT NULL,
        version_id INTEGER NOT NULL,
        accepted_at TIMESTAMP DEFAULT now()
      );
    `);
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS personalregler_user_version_unique
      ON personalregler_godkjenning (user_id, version_id);
    `);
    console.log("[Migration] personalregler_godkjenning OK");

    await client.query(`
      ALTER TABLE vakter ADD COLUMN IF NOT EXISTS timer_godkjent BOOLEAN DEFAULT false;
    `);
    await client.query(`
      ALTER TABLE vakter ADD COLUMN IF NOT EXISTS timer_godkjent_at TIMESTAMP;
    `);
    console.log("[Migration] timer_godkjent columns OK");

    await client.query(`
      CREATE TABLE IF NOT EXISTS lonnsslipper (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id VARCHAR NOT NULL,
        maned TEXT NOT NULL,
        fil_navn TEXT NOT NULL,
        fil_data TEXT NOT NULL,
        opplastet_at TIMESTAMP DEFAULT now(),
        opplastet_av VARCHAR
      );
    `);
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS lonnsslipper_user_maned_unique
      ON lonnsslipper (user_id, maned);
    `);
    console.log("[Migration] lonnsslipper OK");
  } catch (err: any) {
    console.error("[Migration] Feil:", err.message);
  } finally {
    client.release();
  }
}
