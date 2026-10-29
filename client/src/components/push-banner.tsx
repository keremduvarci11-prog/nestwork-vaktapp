import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BellRing, BellOff } from "lucide-react";
import { getPushPermissionState, subscribeToPush } from "@/lib/push";

interface PushBannerProps {
  compact?: boolean;
}

export function PushPermissionBanner({ compact }: PushBannerProps) {
  const [status, setStatus] = useState<"prompt" | "granted" | "denied" | "unsupported">("prompt");
  const [requesting, setRequesting] = useState(false);
  const [error, setError] = useState("");
  const native = ["android", "ios"].includes((window as any).Capacitor?.getPlatform?.());

  useEffect(() => {
    const refresh = () => {
      void getPushPermissionState().then(setStatus).catch(() => {
        setError("Kunne ikke sjekke varslingstillatelsen. Prøv igjen.");
      });
    };
    refresh();
    window.addEventListener("focus", refresh);
    window.addEventListener("nestwork-push-change", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      window.removeEventListener("nestwork-push-change", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);

  const handleEnable = async () => {
    setRequesting(true);
    setError("");
    try {
      await subscribeToPush();
      setStatus(await getPushPermissionState());
    } catch (e) {
      setError("Kunne ikke aktivere varsler. Sjekk internettforbindelsen og prøv igjen.");
    }
    setRequesting(false);
  };

  if (status === "granted" && !error) return null;
  if (status === "unsupported") {
    if (!native) return null;
    return <p className="text-sm text-amber-600 p-3" role="status">Oppdater Nestwork-appen for å kunne motta varsler på telefonen.</p>;
  }

  if (status === "denied") {
    return (
      <Card className="border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950" data-testid="card-push-denied">
        <CardContent className={compact ? "p-3" : "p-4"}>
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-full bg-red-100 dark:bg-red-900 flex items-center justify-center flex-shrink-0">
              <BellOff className="w-4 h-4 text-red-500" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-red-700 dark:text-red-300">Varsler er blokkert</p>
              <p className="text-xs text-red-600 dark:text-red-400 mt-0.5">
                {native
                  ? "Åpne telefonens innstillinger → Apper → Nestwork → Varsler, og tillat varsler."
                  : "For å få varsler på telefonen, åpne nettleserinnstillingene og tillat varsler for denne siden."}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-primary/30 bg-primary/5" data-testid="card-push-prompt">
      <CardContent className={compact ? "p-3" : "p-4"}>
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
            <BellRing className="w-4 h-4 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold">Få varsler på telefonen</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Skru på varsler for å bli varslet om nye vakter og meldinger — også når du ikke er inne i appen.
            </p>
            {error && <p role="alert" className="text-xs text-destructive mt-1">{error}</p>}
            <Button
              size="sm"
              className="mt-2"
              onClick={handleEnable}
              disabled={requesting}
              data-testid="button-enable-push"
            >
              <BellRing className="w-3.5 h-3.5 mr-1.5" />
              {requesting ? "Ber om tillatelse..." : "Skru på varsler"}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
