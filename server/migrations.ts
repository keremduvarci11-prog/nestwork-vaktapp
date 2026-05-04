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
  } catch (err: any) {
    console.error("[Migration] Feil:", err.message);
  } finally {
    client.release();
  }
}
