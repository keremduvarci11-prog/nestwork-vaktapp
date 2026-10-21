import type { PoolClient } from "pg";
import { PAID_BREAK_EXEMPT_KINDERGARTEN_IDS } from "@shared/shiftHours";

/**
 * Authorized correction of legacy Espira paid-break flags. The ordinary
 * sheet outbox trigger must already exist. Same shift IDs and agreed totals
 * are preserved, so this cannot double-deduct previously corrected hours.
 */
export async function correctEspiraBreaks(client: Pick<PoolClient, "query">): Promise<number> {
  await client.query("BEGIN");
  try {
    const result = await client.query(`
      UPDATE vakter AS v
      SET betalt_pause = false,
          trekk_pause = (
            v.avtalte_betalte_timer IS NULL
            AND EXTRACT(EPOCH FROM (v.slutt_tid - v.start_tid)) >= 19800
          ),
          beskrivelse = CASE
            WHEN v.beskrivelse LIKE '%Betalt pause beholdes; ikke ekstra pausefratrekk.%'
            THEN replace(
              v.beskrivelse,
              'Betalt pause beholdes; ikke ekstra pausefratrekk.',
              'Espira har ikke betalt pause. Avtalt arbeidstid for de to arbeidsperiodene er beholdt.'
            )
            ELSE v.beskrivelse
          END
      FROM barnehager AS b
      WHERE v.barnehage_id = b.id
        AND (
          b.id = ANY($1::varchar[])
          OR b.name ~* '(^|[^[:alnum:]_])espira([^[:alnum:]_]|$)'
        )
        AND v.betalt_pause IS TRUE
    `, [[...PAID_BREAK_EXEMPT_KINDERGARTEN_IDS]]);
    await client.query("COMMIT");
    return result.rowCount ?? 0;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}
