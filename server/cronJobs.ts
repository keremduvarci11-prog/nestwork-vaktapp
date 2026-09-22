import cron from "node-cron";
import { storage } from "./storage";
import { notifyRegion, notifyUser } from "./notifications";
import {
  CRON_TIME_ZONE,
  isShiftEndReminderDue,
  tomorrowDateInOslo,
} from "./cronTiming";

const regionGroups: Record<string, string[]> = {
  Bergen: ["Bergen", "Os"],
  Os: ["Bergen", "Os"],
  Haugesund: ["Haugesund", "Stord"],
  Stord: ["Haugesund", "Stord"],
};

export function startCronJobs() {
  cron.schedule("*/5 * * * *", async () => {
    try {
      const allVakter = await storage.getVakter();
      const now = new Date();

      for (const vakt of allVakter) {
        if (!vakt.createdAt) continue;

        if (vakt.status === "ledig") {
          const created = new Date(vakt.createdAt);
          const diffMs = now.getTime() - created.getTime();
          const diffHours = diffMs / (1000 * 60 * 60);
          if (diffHours >= 2 && diffHours < 2.1) {
            const bh = await storage.getBarnehage(vakt.barnehageId);
            const occupiedEmployeeIds = allVakter
              .filter((otherVakt) => otherVakt.dato === vakt.dato && !!otherVakt.ansattId)
              .map((otherVakt) => otherVakt.ansattId!);
            await notifyRegion(
              vakt.region,
              "Vakt fremdeles ledig",
              `Vakten ${vakt.dato} hos ${bh?.name || "ukjent"} er fremdeles ledig. Var rask!`,
              "reminder",
              "/",
              occupiedEmployeeIds
            );
          }
        }

        if (vakt.status === "tildelt" && vakt.ansattId) {
          const created = new Date(vakt.createdAt);
          const diffMs = now.getTime() - created.getTime();
          const diffHours = diffMs / (1000 * 60 * 60);
          if (diffHours >= 1 && diffHours < 1.1) {
            const bh = await storage.getBarnehage(vakt.barnehageId);
            await notifyUser(
              vakt.ansattId,
              "Husk a godkjenne vakten",
              `Du har en tildelt vakt ${vakt.dato} hos ${bh?.name || "ukjent"} som venter pa godkjenning.`,
              "reminder",
              "/mine-vakter"
            );
          }
        }

        if (
          vakt.status === "godkjent" &&
          vakt.ansattId &&
          !vakt.timerInnsendt &&
          vakt.dato &&
          vakt.sluttTid
        ) {
          if (isShiftEndReminderDue(now, vakt.dato, vakt.sluttTid)) {
            const fresh = await storage.getVakt(vakt.id);
            if (fresh && fresh.status === "godkjent" && fresh.ansattId && !fresh.timerInnsendt) {
              const bh = await storage.getBarnehage(fresh.barnehageId);
              await notifyUser(
                fresh.ansattId,
                "Husk a sende inn timer",
                `Vakten din hos ${bh?.name || "ukjent"} er ferdig. Husk a sende inn timene dine til godkjenning!`,
                "reminder",
                "/lonn-timer"
              );
            }
          }
        }
      }
    } catch (err) {
      console.error("[Cron] Feil ved sjekk av vakter:", err);
    }
  }, {
    timezone: CRON_TIME_ZONE,
  });

  cron.schedule("0 20 * * *", async () => {
    try {
      const allVakter = await storage.getVakter();
      const tomorrowStr = tomorrowDateInOslo(new Date());

      const tomorrowVakter = allVakter.filter(
        (v) => v.dato === tomorrowStr && v.status === "godkjent" && v.ansattId
      );

      for (const vakt of tomorrowVakter) {
        if (!vakt.ansattId) continue;
        const bh = await storage.getBarnehage(vakt.barnehageId);
        await notifyUser(
          vakt.ansattId,
          "Lykke til pa vakt i morgen!",
          `Lykke til pa vakt i morgen kl. ${vakt.startTid?.slice(0, 5)} hos ${bh?.name || "ukjent"}!`,
          "reminder",
          "/mine-vakter"
        );
      }
    } catch (err) {
      console.error("[Cron] Feil ved kveldspaminnelse:", err);
    }
  }, {
    timezone: CRON_TIME_ZONE,
  });

  console.log("[Cron] Bakgrunnsjobber startet");
}
