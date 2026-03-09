import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { MapPin, Clock, Calendar, Building2, AlertCircle, ArrowRight, ClipboardList, UserCheck, CheckCircle2 } from "lucide-react";
import type { Vakt, Barnehage, Onboarding } from "@shared/schema";


export default function EmployeeHome() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [, navigate] = useLocation();

  const { data: vakter, isLoading: vLoading } = useQuery<Vakt[]>({
    queryKey: ["/api/vakter", `?region=${user?.region}`],
  });

  const { data: barnehager } = useQuery<Barnehage[]>({
    queryKey: ["/api/barnehager"],
  });

  const { data: mineVakter } = useQuery<Vakt[]>({
    queryKey: ["/api/vakter/mine", user?.id],
  });

  const taVaktMutation = useMutation({
    mutationFn: (vaktId: string) =>
      apiRequest("POST", `/api/vakter/${vaktId}/ta`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/vakter"] });
      toast({ title: "Vakt registrert!", description: "Venter på godkjenning fra admin." });
    },
    onError: () => {
      toast({ title: "Feil", description: "Kunne ikke ta vakten", variant: "destructive" });
    },
  });

  const godtaVaktMutation = useMutation({
    mutationFn: (vaktId: string) => apiRequest("POST", `/api/vakter/${vaktId}/godta`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/vakter"] });
      toast({ title: "Vakt godtatt!", description: "Vakten er nå bekreftet." });
    },
    onError: () => {
      toast({ title: "Feil", description: "Kunne ikke godta vakten", variant: "destructive" });
    },
  });

  const { data: onboardingItems } = useQuery<Onboarding[]>({
    queryKey: ["/api/onboarding", user?.id],
  });

  const bhMap = new Map(barnehager?.map((b) => [b.id, b]) || []);
  const today = new Date().toISOString().split("T")[0];
  const ledigeVakter = vakter?.filter((v) => v.status === "ledig" && v.dato >= today) || [];
  const tildelte = mineVakter?.filter((v) => v.status === "tildelt" && v.dato >= today) || [];

  const onboardingDone = onboardingItems?.filter((i) => i.completed).length || 0;
  const onboardingTotal = onboardingItems?.length || 0;
  const hasUnfinishedOnboarding = onboardingTotal > 0 && onboardingDone < onboardingTotal;

  const formatDate = (d: string) => {
    const date = new Date(d + "T00:00:00");
    return date.toLocaleDateString("nb-NO", { weekday: "short", day: "numeric", month: "short" });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">Hei, {user?.name?.split(" ")[0]}!</h1>
        <p className="text-sm text-muted-foreground mt-1">
          <MapPin className="w-3.5 h-3.5 inline mr-1" />
          {user?.region} - {ledigeVakter.length} ledige vakter
        </p>
      </div>

      {hasUnfinishedOnboarding && (
        <Card className="border-primary/30 bg-primary/5" data-testid="card-onboarding-banner">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                <ClipboardList className="w-5 h-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold">Fullfør oppsettet ditt</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Du har {onboardingTotal - onboardingDone} steg igjen. Bytt passord, last opp CV og politiattest, og legg inn profilbilde.
                </p>
                <Button
                  size="sm"
                  className="mt-2"
                  onClick={() => navigate("/onboarding")}
                  data-testid="button-goto-onboarding"
                >
                  Kom i gang
                  <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {tildelte.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs font-semibold text-purple-700 dark:text-purple-300 uppercase tracking-wide">
            Vakter tildelt deg
          </p>
          {tildelte.map((vakt) => {
            const bh = bhMap.get(vakt.barnehageId);
            return (
              <Card key={vakt.id} className="border-purple-200 dark:border-purple-800" data-testid={`card-tildelt-${vakt.id}`}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <h3 className="font-semibold text-sm">{bh?.name || "Ukjent"}</h3>
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200">
                      <UserCheck className="w-3 h-3" />
                      Tildelt deg
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 mb-3 text-sm">
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <Calendar className="w-3.5 h-3.5 flex-shrink-0" />
                      <span>{formatDate(vakt.dato)}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <Clock className="w-3.5 h-3.5 flex-shrink-0" />
                      <span>{vakt.startTid?.slice(0, 5)} - {vakt.sluttTid?.slice(0, 5)}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-muted-foreground col-span-2">
                      <Building2 className="w-3.5 h-3.5 flex-shrink-0" />
                      <span className="truncate">{bh?.address}</span>
                    </div>
                  </div>
                  <Button
                    data-testid={`button-godta-vakt-${vakt.id}`}
                    className="w-full"
                    onClick={() => godtaVaktMutation.mutate(vakt.id)}
                    disabled={godtaVaktMutation.isPending}
                  >
                    <CheckCircle2 className="w-4 h-4 mr-1.5" />
                    Godta vakt
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {vLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-36 w-full rounded-md" />
          ))}
        </div>
      ) : ledigeVakter.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <AlertCircle className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
            <p className="font-medium">Ingen ledige vakter</p>
            <p className="text-sm text-muted-foreground mt-1">
              Det er ingen ledige vakter i {user?.region} akkurat nå.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {ledigeVakter.map((vakt) => {
            const bh = bhMap.get(vakt.barnehageId);
            return (
              <Card key={vakt.id} className="hover-elevate">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="min-w-0 flex-1">
                      <h3 className="font-semibold text-sm truncate mb-1">{bh?.name || "Ukjent"}</h3>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 mb-3 text-sm">
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <Calendar className="w-3.5 h-3.5 flex-shrink-0" />
                      <span>{formatDate(vakt.dato)}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <Clock className="w-3.5 h-3.5 flex-shrink-0" />
                      <span>{vakt.startTid?.slice(0, 5)} - {vakt.sluttTid?.slice(0, 5)}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-muted-foreground col-span-2">
                      <Building2 className="w-3.5 h-3.5 flex-shrink-0" />
                      <span className="truncate">{bh?.address}</span>
                    </div>
                  </div>

                  {vakt.beskrivelse && (
                    <p className="text-xs text-muted-foreground mb-3 line-clamp-2">{vakt.beskrivelse}</p>
                  )}

                  <Button
                    data-testid={`button-ta-vakt-${vakt.id}`}
                    className="w-full"
                    onClick={() => taVaktMutation.mutate(vakt.id)}
                    disabled={taVaktMutation.isPending}
                  >
                    TA VAKT
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
