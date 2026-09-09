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
      CREATE TABLE IF NOT EXISTS sheet_sync_jobs (
        vakt_id VARCHAR PRIMARY KEY,
        action TEXT NOT NULL CHECK (action IN ('sync', 'delete')),
        payload JSONB,
        version BIGINT NOT NULL DEFAULT 1,
        generation UUID NOT NULL DEFAULT gen_random_uuid(),
        legacy_resolved BOOLEAN NOT NULL DEFAULT false,
        attempts INTEGER NOT NULL DEFAULT 0,
        next_attempt_at TIMESTAMP NOT NULL DEFAULT now(),
        last_error TEXT,
        updated_at TIMESTAMP NOT NULL DEFAULT now()
      );
    `);
    await client.query(`
      ALTER TABLE sheet_sync_jobs
        ADD COLUMN IF NOT EXISTS generation UUID DEFAULT gen_random_uuid(),
        ADD COLUMN IF NOT EXISTS legacy_resolved BOOLEAN DEFAULT false;
      UPDATE sheet_sync_jobs
      SET generation = COALESCE(generation, gen_random_uuid()),
          legacy_resolved = COALESCE(legacy_resolved, false)
      WHERE generation IS NULL OR legacy_resolved IS NULL;
      ALTER TABLE sheet_sync_jobs
        ALTER COLUMN generation SET NOT NULL,
        ALTER COLUMN legacy_resolved SET NOT NULL;
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS sheet_sync_jobs_due_idx
      ON sheet_sync_jobs (next_attempt_at);
    `);
    await client.query(`
      CREATE OR REPLACE FUNCTION enqueue_vakt_sheet_sync_job()
      RETURNS TRIGGER AS $$
      DECLARE
        job_action TEXT;
        job_payload JSONB;
        relevant_change BOOLEAN;
      BEGIN
        IF TG_OP = 'INSERT' THEN
          job_action := 'sync';
          job_payload := NULL;
        ELSIF TG_OP = 'DELETE' THEN
          job_action := 'delete';
          job_payload := to_jsonb(OLD);
        ELSE
          relevant_change :=
            OLD.ansatt_id IS DISTINCT FROM NEW.ansatt_id OR
            OLD.barnehage_id IS DISTINCT FROM NEW.barnehage_id OR
            OLD.beskrivelse IS DISTINCT FROM NEW.beskrivelse OR
            OLD.dato IS DISTINCT FROM NEW.dato OR
            OLD.start_tid IS DISTINCT FROM NEW.start_tid OR
            OLD.slutt_tid IS DISTINCT FROM NEW.slutt_tid OR
            OLD.lonn_utbetalt IS DISTINCT FROM NEW.lonn_utbetalt OR
            OLD.vikarkode IS DISTINCT FROM NEW.vikarkode OR
            OLD.syk_ikke_mott IS DISTINCT FROM NEW.syk_ikke_mott OR
            OLD.provetime IS DISTINCT FROM NEW.provetime;
          IF NOT relevant_change THEN
            RETURN NEW;
          END IF;
          job_action := 'sync';
          job_payload := to_jsonb(OLD);
        END IF;

        INSERT INTO sheet_sync_jobs (vakt_id, action, payload)
        VALUES (COALESCE(NEW.id, OLD.id), job_action, job_payload)
        ON CONFLICT (vakt_id) DO UPDATE SET
          action = EXCLUDED.action,
          payload = CASE
            WHEN EXCLUDED.action = 'delete'
              THEN COALESCE(sheet_sync_jobs.payload, EXCLUDED.payload)
            WHEN sheet_sync_jobs.action = 'sync'
              THEN COALESCE(sheet_sync_jobs.payload, EXCLUDED.payload)
            ELSE EXCLUDED.payload
          END,
          version = sheet_sync_jobs.version + 1,
          generation = gen_random_uuid(),
          legacy_resolved = CASE
            WHEN sheet_sync_jobs.action = 'delete' AND EXCLUDED.action = 'delete'
              THEN sheet_sync_jobs.legacy_resolved
            ELSE false
          END,
          attempts = 0,
          next_attempt_at = GREATEST(sheet_sync_jobs.next_attempt_at, now()),
          last_error = NULL,
          updated_at = now();

        IF TG_OP = 'DELETE' THEN
          RETURN OLD;
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);
    await client.query(`
      DROP TRIGGER IF EXISTS vakter_sheet_sync_outbox ON vakter;
      CREATE TRIGGER vakter_sheet_sync_outbox
      AFTER INSERT OR UPDATE OR DELETE ON vakter
      FOR EACH ROW EXECUTE FUNCTION enqueue_vakt_sheet_sync_job();
    `);
    console.log("[Migration] sheet_sync_jobs OK");

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
    throw err;
  } finally {
    client.release();
  }
}
