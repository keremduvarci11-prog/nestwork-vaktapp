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

    await client.query(`
      ALTER TABLE vakter
        ADD COLUMN IF NOT EXISTS barnehage_informert BOOLEAN DEFAULT false,
        ADD COLUMN IF NOT EXISTS provetime BOOLEAN DEFAULT false,
        ADD COLUMN IF NOT EXISTS syk_ikke_mott BOOLEAN DEFAULT false,
        ADD COLUMN IF NOT EXISTS fakturert BOOLEAN DEFAULT false,
        ADD COLUMN IF NOT EXISTS lonn_utbetalt BOOLEAN DEFAULT false;
    `);
    await client.query(`
      UPDATE vakter SET
        barnehage_informert = COALESCE(barnehage_informert, false),
        provetime = COALESCE(provetime, false),
        syk_ikke_mott = COALESCE(syk_ikke_mott, false),
        fakturert = COALESCE(fakturert, false),
        lonn_utbetalt = COALESCE(lonn_utbetalt, false)
      WHERE barnehage_informert IS NULL OR provetime IS NULL
         OR syk_ikke_mott IS NULL OR fakturert IS NULL OR lonn_utbetalt IS NULL;
    `);
    console.log("[Migration] vakter sheet-sync kolonner OK");

    await client.query(`
      ALTER TABLE meldinger
        ADD COLUMN IF NOT EXISTS last_activity_at TIMESTAMP DEFAULT now();
    `);
    await client.query(`
      UPDATE meldinger AS m
      SET last_activity_at = GREATEST(
        COALESCE(
          (SELECT MAX(sm.created_at) FROM samtale_meldinger AS sm WHERE sm.melding_id = m.id),
          TIMESTAMP '1970-01-01'
        ),
        COALESCE(m.replied_at, TIMESTAMP '1970-01-01'),
        COALESCE(m.created_at, now())
      );
    `);
    console.log("[Migration] meldinger aktivitetstid OK");
  } catch (err: any) {
    console.error("[Migration] Feil:", err.message);
  } finally {
    client.release();
  }
}
