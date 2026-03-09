import cron from "node-cron";
import { storage } from "./storage";
import { notifyRegion, notifyUser } from "./notifications";

const regionGroups: Record<string, string[]> = {
  Bergen: ["Bergen", "Os"],
  Os: ["Bergen", "Os"],
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
            await notifyRegion(
              vakt.region,
              "Vakt fremdeles ledig",
              `Vakten ${vakt.dato} hos ${bh?.name || "ukjent"} er fremdeles ledig. Var rask!`,
              "reminder",
              "/"
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
      }
    } catch (err) {
      console.error("[Cron] Feil ved sjekk av vakter:", err);
    }
  });

  cron.schedule("0 20 * * *", async () => {
    try {
      const allVakter = await storage.getVakter();
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowStr = tomorrow.toISOString().split("T")[0];

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
  });

  console.log("[Cron] Bakgrunnsjobber startet");
}
