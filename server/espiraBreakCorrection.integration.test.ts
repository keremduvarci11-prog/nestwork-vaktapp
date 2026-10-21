import assert from "node:assert/strict";
import test from "node:test";
import { pool } from "./db";
import { correctEspiraBreaks } from "./espiraBreakCorrection";

const enabled = process.env.RUN_ESPIRA_BREAK_INTEGRATION === "1" &&
  process.env.NODE_ENV === "development" &&
  !/(?:^|[./_-])prod(?:uction)?(?:[./?_-]|$)/i.test(process.env.DATABASE_URL ?? "");

test("Espira correction preserves agreements and lifecycle, queues same-ID sheet updates, and is idempotent", {
  skip: enabled ? false : "requires explicit development-only opt-in",
}, async () => {
  const client = await pool.connect();
  const schema = `espira_break_test_${process.pid}_${Date.now()}`;
  try {
    await client.query(`CREATE SCHEMA "${schema}"`);
    await client.query(`SET search_path TO "${schema}"`);
    await client.query(`
      CREATE TABLE barnehager (id varchar PRIMARY KEY, name text NOT NULL);
      CREATE TABLE vakter (
        id varchar PRIMARY KEY, barnehage_id varchar NOT NULL,
        dato date NOT NULL DEFAULT '2026-10-19',
        start_tid time NOT NULL DEFAULT '08:00', slutt_tid time NOT NULL DEFAULT '15:30',
        betalt_pause boolean NOT NULL DEFAULT true, trekk_pause boolean NOT NULL DEFAULT false,
        avtalte_betalte_timer numeric(6,2), beskrivelse text,
        ansatt_id varchar DEFAULT 'synthetic-employee', status text DEFAULT 'godkjent',
        timer_godkjent boolean DEFAULT true, lonn_utbetalt boolean DEFAULT false,
        fakturert boolean DEFAULT false, provetime boolean DEFAULT false
      );
      CREATE TABLE sheet_sync_jobs (vakt_id varchar PRIMARY KEY);
      CREATE FUNCTION enqueue_test_sheet_update() RETURNS TRIGGER AS $$
        BEGIN
          INSERT INTO sheet_sync_jobs(vakt_id) VALUES(NEW.id)
          ON CONFLICT DO NOTHING;
          RETURN NEW;
        END;
      $$ LANGUAGE plpgsql;
      CREATE TRIGGER test_outbox AFTER UPDATE ON vakter
      FOR EACH ROW EXECUTE FUNCTION enqueue_test_sheet_update();
      INSERT INTO barnehager VALUES ('new-espira', 'Espira Newly registered'), ('ordinary', 'Spiren Barnehage');
      INSERT INTO vakter(id, barnehage_id) VALUES ('normal', 'new-espira'), ('non-espira', 'ordinary');
      INSERT INTO vakter(id, barnehage_id, start_tid, slutt_tid) VALUES ('short', 'new-espira', '07:30', '11:15');
      INSERT INTO vakter(id, barnehage_id, avtalte_betalte_timer) VALUES ('already-deducted', 'new-espira', 7);
      INSERT INTO vakter(id, barnehage_id, avtalte_betalte_timer, beskrivelse)
      VALUES ('split', 'new-espira', 5.70, 'Arbeidsperioder. Betalt pause beholdes; ikke ekstra pausefratrekk.');
    `);
    const before = (await client.query("SELECT * FROM vakter ORDER BY id")).rows;
    assert.equal(await correctEspiraBreaks(client), 4);
    const after = (await client.query("SELECT * FROM vakter ORDER BY id")).rows;
    for (const row of after) {
      const old = before.find((v) => v.id === row.id)!;
      if (row.id === "non-espira") {
        assert.deepEqual(row, old);
        continue;
      }
      assert.equal(row.betalt_pause, false);
      assert.equal(row.trekk_pause, row.id === "normal");
      for (const key of Object.keys(old).filter((k) => !["betalt_pause", "trekk_pause", "beskrivelse"].includes(k))) {
        assert.deepEqual(row[key], old[key], key);
      }
      assert.equal(row.beskrivelse?.includes("Betalt pause beholdes") ?? false, false);
    }
    assert.deepEqual((await client.query("SELECT vakt_id FROM sheet_sync_jobs ORDER BY vakt_id")).rows,
      ["already-deducted", "normal", "short", "split"].map((vakt_id) => ({ vakt_id })));
    assert.equal(await correctEspiraBreaks(client), 0);
  } finally {
    await client.query("RESET search_path");
    await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    client.release();
    await pool.end();
  }
});
