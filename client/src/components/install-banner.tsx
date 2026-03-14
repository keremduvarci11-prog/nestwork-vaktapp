import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, X, Smartphone, Menu } from "lucide-react";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

function detectBrowser() {
  const ua = navigator.userAgent;
  const isAndroid = /Android/i.test(ua);
  const isIOS = /iPhone|iPad|iPod/i.test(ua);
  const isSamsungInternet = /SamsungBrowser/i.test(ua);
  const isStandalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as any).standalone === true;
  return { isAndroid, isIOS, isSamsungInternet, isStandalone };
}

export function InstallBanner() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [browser, setBrowser] = useState({ isAndroid: false, isIOS: false, isSamsungInternet: false, isStandalone: false });

  useEffect(() => {
    const info = detectBrowser();
    setBrowser(info);

    if (info.isStandalone) return;

    const prev = localStorage.getItem("install-banner-dismissed");
    if (prev) {
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
      handleDismiss();
    }
    setDeferredPrompt(null);
  };

  const handleDismiss = () => {
    setDismissed(true);
    localStorage.setItem("install-banner-dismissed", "true");
  };

  if (browser.isStandalone || dismissed) return null;

  if (deferredPrompt) {
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

  if (browser.isSamsungInternet) {
    return (
      <Card className="border-primary/30 bg-primary/5" data-testid="card-install-samsung">
        <CardContent className="p-3">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
              <Smartphone className="w-4 h-4 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold">Legg til pa hjemskjermen</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Fa Nestwork som en app pa telefonen din!
              </p>
              {!showGuide ? (
                <Button
                  size="sm"
                  className="mt-2"
                  onClick={() => setShowGuide(true)}
                  data-testid="button-show-install-guide"
                >
                  <Smartphone className="w-3.5 h-3.5 mr-1.5" />
                  Vis meg hvordan
                </Button>
              ) : (
                <div className="mt-3 space-y-2.5 text-xs text-foreground">
                  <div className="flex items-start gap-2">
                    <span className="bg-primary text-primary-foreground rounded-full w-5 h-5 flex items-center justify-center flex-shrink-0 text-[10px] font-bold">1</span>
                    <span>Trykk pa <strong>menyknappen</strong> <Menu className="w-3.5 h-3.5 inline" /> (tre streker nederst til hoyre)</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="bg-primary text-primary-foreground rounded-full w-5 h-5 flex items-center justify-center flex-shrink-0 text-[10px] font-bold">2</span>
                    <span>Velg <strong>"Legg til side pa"</strong></span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="bg-primary text-primary-foreground rounded-full w-5 h-5 flex items-center justify-center flex-shrink-0 text-[10px] font-bold">3</span>
                    <span>Trykk <strong>"Startskjerm"</strong></span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="bg-primary text-primary-foreground rounded-full w-5 h-5 flex items-center justify-center flex-shrink-0 text-[10px] font-bold">4</span>
                    <span>Trykk <strong>"Legg til"</strong> — ferdig!</span>
                  </div>
                  <p className="text-muted-foreground pt-1">
                    Na kan du apne Nestwork fra hjemskjermen som en vanlig app.
                  </p>
                </div>
              )}
            </div>
            <button
              onClick={handleDismiss}
              className="text-muted-foreground hover:text-foreground p-1"
              data-testid="button-dismiss-install-samsung"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (browser.isIOS) {
    return (
      <Card className="border-primary/30 bg-primary/5" data-testid="card-install-ios">
        <CardContent className="p-3">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
              <Smartphone className="w-4 h-4 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold">Legg til pa hjemskjermen</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Fa Nestwork som en app pa telefonen din!
              </p>
              {!showGuide ? (
                <Button
                  size="sm"
                  className="mt-2"
                  onClick={() => setShowGuide(true)}
                  data-testid="button-show-install-guide-ios"
                >
                  <Smartphone className="w-3.5 h-3.5 mr-1.5" />
                  Vis meg hvordan
                </Button>
              ) : (
                <div className="mt-3 space-y-2.5 text-xs text-foreground">
                  <div className="flex items-start gap-2">
                    <span className="bg-primary text-primary-foreground rounded-full w-5 h-5 flex items-center justify-center flex-shrink-0 text-[10px] font-bold">1</span>
                    <span>Trykk pa <strong>Del-knappen</strong> (firkant med pil opp) nederst i Safari</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="bg-primary text-primary-foreground rounded-full w-5 h-5 flex items-center justify-center flex-shrink-0 text-[10px] font-bold">2</span>
                    <span>Bla ned og velg <strong>"Legg til pa Hjem-skjerm"</strong></span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="bg-primary text-primary-foreground rounded-full w-5 h-5 flex items-center justify-center flex-shrink-0 text-[10px] font-bold">3</span>
                    <span>Trykk <strong>"Legg til"</strong> oppe til hoyre — ferdig!</span>
                  </div>
                  <p className="text-muted-foreground pt-1">
                    Na kan du apne Nestwork fra hjemskjermen som en vanlig app.
                  </p>
                </div>
              )}
            </div>
            <button
              onClick={handleDismiss}
              className="text-muted-foreground hover:text-foreground p-1"
              data-testid="button-dismiss-install-ios"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (browser.isAndroid) {
    return (
      <Card className="border-primary/30 bg-primary/5" data-testid="card-install-android">
        <CardContent className="p-3">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
              <Smartphone className="w-4 h-4 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold">Legg til pa hjemskjermen</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Fa Nestwork som en app pa telefonen din!
              </p>
              {!showGuide ? (
                <Button
                  size="sm"
                  className="mt-2"
                  onClick={() => setShowGuide(true)}
                  data-testid="button-show-install-guide-android"
                >
                  <Smartphone className="w-3.5 h-3.5 mr-1.5" />
                  Vis meg hvordan
                </Button>
              ) : (
                <div className="mt-3 space-y-2.5 text-xs text-foreground">
                  <div className="flex items-start gap-2">
                    <span className="bg-primary text-primary-foreground rounded-full w-5 h-5 flex items-center justify-center flex-shrink-0 text-[10px] font-bold">1</span>
                    <span>Trykk pa <strong>menyknappen</strong> (tre prikker oppe til hoyre)</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="bg-primary text-primary-foreground rounded-full w-5 h-5 flex items-center justify-center flex-shrink-0 text-[10px] font-bold">2</span>
                    <span>Velg <strong>"Legg til pa startsiden"</strong> eller <strong>"Installer appen"</strong></span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="bg-primary text-primary-foreground rounded-full w-5 h-5 flex items-center justify-center flex-shrink-0 text-[10px] font-bold">3</span>
                    <span>Trykk <strong>"Legg til"</strong> — ferdig!</span>
                  </div>
                  <p className="text-muted-foreground pt-1">
                    Na kan du apne Nestwork fra hjemskjermen som en vanlig app.
                  </p>
                </div>
              )}
            </div>
            <button
              onClick={handleDismiss}
              className="text-muted-foreground hover:text-foreground p-1"
              data-testid="button-dismiss-install-android"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return null;
}
