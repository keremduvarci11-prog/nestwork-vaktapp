import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, X } from "lucide-react";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function InstallBanner() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    if (window.matchMedia("(display-mode: standalone)").matches) {
      setIsInstalled(true);
      return;
    }
    if ((navigator as any).standalone === true) {
      setIsInstalled(true);
      return;
    }

    const dismissed = sessionStorage.getItem("install-banner-dismissed");
    if (dismissed) {
      setDismissed(true);
      return;
    }

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") {
      setIsInstalled(true);
    }
    setDeferredPrompt(null);
  };

  const handleDismiss = () => {
    setDismissed(true);
    sessionStorage.setItem("install-banner-dismissed", "true");
  };

  if (isInstalled || dismissed || !deferredPrompt) return null;

  return (
    <Card className="border-primary/30 bg-primary/5" data-testid="card-install-prompt">
      <CardContent className="p-3">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
            <Download className="w-4 h-4 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold">Installer Nestwork-appen</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Legg til appen pa hjemskjermen for raskere tilgang og varsler.
            </p>
            <Button
              size="sm"
              className="mt-2"
              onClick={handleInstall}
              data-testid="button-install-app"
            >
              <Download className="w-3.5 h-3.5 mr-1.5" />
              Installer appen
            </Button>
          </div>
          <button
            onClick={handleDismiss}
            className="text-muted-foreground hover:text-foreground p-1"
            data-testid="button-dismiss-install"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </CardContent>
    </Card>
  );
}
