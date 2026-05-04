import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ArrowLeft, CheckCircle2, Loader2 } from "lucide-react";
import { useLocation } from "wouter";

interface PersonalreglerStatusResponse {
  accepted: boolean;
  acceptedAt: string | null;
  currentVersion: number;
}

export function PersonalreglerFullscreen({ onComplete }: { onComplete: () => void }) {
  return <PersonalreglerContent isFullscreen onComplete={onComplete} />;
}

export default function PersonalreglerPage() {
  const [, navigate] = useLocation();

  const { data: status } = useQuery<PersonalreglerStatusResponse>({
    queryKey: ["/api/personalregler/status"],
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate("/innstillinger")} data-testid="button-back-innstillinger">
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <h1 className="text-xl font-bold">Personalregler</h1>
      </div>

      {status?.accepted ? (
        <div className="text-center py-8 space-y-3">
          <CheckCircle2 className="w-12 h-12 mx-auto text-green-600" />
          <p className="font-medium">Du har godtatt personalreglene</p>
          <p className="text-sm text-muted-foreground">
            Godkjent: {status.acceptedAt ? new Date(status.acceptedAt).toLocaleDateString("nb-NO", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" }) : ""}
          </p>
        </div>
      ) : null}

      <PersonalreglerContent isFullscreen={false} onComplete={() => {
        queryClient.invalidateQueries({ queryKey: ["/api/personalregler/status"] });
      }} alreadyAccepted={status?.accepted} />
    </div>
  );
}

function PersonalreglerContent({
  isFullscreen,
  onComplete,
  alreadyAccepted,
}: {
  isFullscreen: boolean;
  onComplete: () => void;
  alreadyAccepted?: boolean;
}) {
  const { toast } = useToast();
  const [checked, setChecked] = useState([false, false, false, false]);

  const allChecked = checked.every(Boolean);

  const acceptMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/personalregler/accept"),
    onSuccess: () => {
      toast({ title: "Personalregler godkjent" });
      queryClient.invalidateQueries({ queryKey: ["/api/personalregler/status"] });
      onComplete();
    },
    onError: () => {
      toast({ title: "Feil", description: "Kunne ikke lagre godkjenning", variant: "destructive" });
    },
  });

  const toggle = (index: number) => {
    setChecked((prev) => {
      const next = [...prev];
      next[index] = !next[index];
      return next;
    });
  };

  if (alreadyAccepted && !isFullscreen) return null;

  const containerClass = isFullscreen
    ? "fixed inset-0 z-[100] bg-background overflow-y-auto"
    : "";

  return (
    <div className={containerClass} data-testid="personalregler-container">
      <div className={`max-w-lg mx-auto ${isFullscreen ? "px-4 py-6" : ""}`} style={isFullscreen ? { paddingTop: "calc(env(safe-area-inset-top, 0px) + 24px)", paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 24px)" } : undefined}>
        {isFullscreen && (
          <h1 className="text-xl font-bold text-center mb-6" data-testid="heading-personalregler">
            Personalregler for Nestwork
          </h1>
        )}

        <div className="space-y-6">
          <section className="rounded-lg border p-4 space-y-3" data-testid="section-regel-1">
            <h2 className="font-semibold flex items-center gap-2">
              <span>1. Fravær og oppmøte</span>
            </h2>
            <div className="space-y-2 text-sm text-muted-foreground">
              <p>
                <strong className="text-foreground">Sykdom:</strong> Blir du syk, må du ringe (ikke SMS) både styrer i barnehagen og din leder i Nestwork senest dagen før vaktstart kl. 15:00. Dette er for at vi skal rekke å finne en erstatter.
              </p>
              <p>
                <strong className="text-foreground">Forsentkomming:</strong> Ser du at du blir mer enn 2-3 minutter for sen? Ring barnehagen med en gang og gi beskjed.
              </p>
              <p>
                <strong className="text-foreground">Pålitelighet:</strong> Vi trenger ansatte vi kan stole på. Høyt fravær eller at man ofte kommer for sent, kan føre til at vi ikke kan tilby flere vakter.
              </p>
            </div>
            <label className="flex items-center gap-3 pt-1 cursor-pointer" data-testid="checkbox-regel-1">
              <Checkbox
                checked={checked[0]}
                onCheckedChange={() => toggle(0)}
                data-testid="input-checkbox-1"
              />
              <span className="text-sm font-medium">Jeg har lest og forstått</span>
            </label>
          </section>

          <section className="rounded-lg border p-4 space-y-3" data-testid="section-regel-2">
            <h2 className="font-semibold flex items-center gap-2">
              <span>2. Din rolle i barnehagen</span>
            </h2>
            <div className="space-y-2 text-sm text-muted-foreground">
              <p>
                <strong className="text-foreground">Vær aktiv:</strong> Du er der for barna. Sett deg ned på gulvet, vær med i leken og ta initiativ. Ikke vent på å bli fortalt hva du skal gjøre.
              </p>
              <p>
                <strong className="text-foreground">Mobil og AirPods:</strong> Dette er helt forbudt i arbeidstiden (både inne og ute). Mobilen skal ligge i veska/jakka og kan kun brukes i pausen din på pauserommet.
              </p>
              <p>
                <strong className="text-foreground">Profesjonalitet:</strong> Du er Nestworks ansikt utad. Hils på foreldre og kollegaer med et smil, og vær nysgjerrig på hvordan barnehagen driver sin dag.
              </p>
            </div>
            <label className="flex items-center gap-3 pt-1 cursor-pointer" data-testid="checkbox-regel-2">
              <Checkbox
                checked={checked[1]}
                onCheckedChange={() => toggle(1)}
                data-testid="input-checkbox-2"
              />
              <span className="text-sm font-medium">Jeg har lest og forstått</span>
            </label>
          </section>

          <section className="rounded-lg border p-4 space-y-3" data-testid="section-regel-3">
            <h2 className="font-semibold flex items-center gap-2">
              <span>3. Sikkerhet og taushetsplikt</span>
            </h2>
            <div className="space-y-2 text-sm text-muted-foreground">
              <p>
                <strong className="text-foreground">Taushetsplikt:</strong> Alt du ser og hører om barn, foreldre og ansatte i barnehagen er hemmelig. Du har ikke lov til å snakke om dette med andre, heller ikke etter at du har sluttet i jobben.
              </p>
              <p>
                <strong className="text-foreground">Bilder og sosiale medier:</strong> Det er strengt forbudt å ta bilder eller video av barna. Ingenting fra barnehagen skal deles på Snapchat, Instagram eller andre steder.
              </p>
              <p>
                <strong className="text-foreground">Tilsyn:</strong> Gå aldri fra barna du har ansvaret for. Må du på do eller hente noe? Avklar det med en fast ansatt først.
              </p>
            </div>
            <label className="flex items-center gap-3 pt-1 cursor-pointer" data-testid="checkbox-regel-3">
              <Checkbox
                checked={checked[2]}
                onCheckedChange={() => toggle(2)}
                data-testid="input-checkbox-3"
              />
              <span className="text-sm font-medium">Jeg har lest og forstått</span>
            </label>
          </section>

          <section className="rounded-lg border p-4 space-y-3" data-testid="section-regel-4">
            <h2 className="font-semibold flex items-center gap-2">
              <span>4. Praktiske regler</span>
            </h2>
            <div className="space-y-2 text-sm text-muted-foreground">
              <p>
                <strong className="text-foreground">Klær etter vær:</strong> Vi er ute hver dag, uansett om det regner eller snør. Du må alltid ha med deg klær som gjør at du kan være ute i flere timer uten å fryse eller bli våt.
              </p>
              <p>
                <strong className="text-foreground">Røyking og snus:</strong> Det er ikke lov å røyke eller snuse inne på barnehagens område eller slik at barna ser det.
              </p>
              <p>
                <strong className="text-foreground">Spør om hjelp:</strong> Er du usikker på noe? Spør! Det er bedre å spørre en gang for mye enn å gjøre feil. Vi er her for å lære.
              </p>
              <p>
                <strong className="text-foreground">Rydding:</strong> Hjelp alltid til med å rydde leker, tørke bord etter mat og holde orden på avdelingen.
              </p>
            </div>
            <label className="flex items-center gap-3 pt-1 cursor-pointer" data-testid="checkbox-regel-4">
              <Checkbox
                checked={checked[3]}
                onCheckedChange={() => toggle(3)}
                data-testid="input-checkbox-4"
              />
              <span className="text-sm font-medium">Jeg har lest og forstått</span>
            </label>
          </section>

          <div className="space-y-3 pt-2 pb-4">
            <p className="text-xs text-muted-foreground leading-relaxed">
              Ved å trykke på knappen under bekrefter jeg at jeg har lest og forstått alle reglene over. Jeg er klar over at disse reglene er viktige for sikkerheten til barna og for mitt arbeidsforhold i Nestwork. Jeg forplikter meg til å følge disse i hver vakt jeg tar.
            </p>
            <Button
              className="w-full"
              size="lg"
              disabled={!allChecked || acceptMutation.isPending}
              onClick={() => acceptMutation.mutate()}
              data-testid="button-godta-regler"
            >
              {acceptMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : null}
              Jeg godtar reglene og fullfører
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
