import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { AlertCircle, Building2, Calendar, Check, CheckCircle2, Clock, Send, Users } from "lucide-react";
import { AvailableShiftCandidates } from "@/components/admin/available-shift-candidates";
import { approvalOpenShifts } from "@shared/approvalShifts";
import type { Vakt, Barnehage, User as UserType, VaktInteresse } from "@shared/schema";
import { calculatePaidHours, shouldDeductPause } from "@shared/shiftHours";

export default function GodkjennVakter() {
  const { toast } = useToast();
  const [tab, setTab] = useState<"interesse" | "timer">("interesse");

  const vakterQuery = useQuery<Vakt[]>({
    queryKey: ["/api/vakter"],
  });
  const { data: vakter, isLoading, isError, refetch } = vakterQuery;
  const { data: barnehager } = useQuery<Barnehage[]>({
    queryKey: ["/api/barnehager"],
  });
  const { data: users } = useQuery<UserType[]>({
    queryKey: ["/api/users"],
  });
  const interesserQuery = useQuery<VaktInteresse[]>({
    queryKey: ["/api/vakt-interesser"],
  });

  const bhMap = new Map(barnehager?.map((b) => [b.id, b]) || []);
  const userMap = new Map(users?.map((u) => [u.id, u]) || []);

  const interesserByVakt = new Map<string, VaktInteresse[]>();
  interesserQuery.data?.forEach((interesse) => {
    const list = interesserByVakt.get(interesse.vaktId) || [];
    list.push(interesse);
    interesserByVakt.set(interesse.vaktId, list);
  });

  const åpneVakter = approvalOpenShifts(vakter || []);
  const vakterMedTimerInnsendt = vakter?.filter(
    (vakt) => vakt.timerInnsendt && !vakt.timerGodkjent
  ) || [];
  const antallMedInteresse = interesserQuery.data && !interesserQuery.isError
    ? åpneVakter.filter((vakt) => (interesserByVakt.get(vakt.id)?.length || 0) > 0).length
    : null;
  const antallUtenInteresse = antallMedInteresse === null ? null : åpneVakter.length - antallMedInteresse;

  const godkjenn = useMutation({
    mutationFn: ({ vaktId, ansattId }: { vaktId: string; ansattId: string }) =>
      apiRequest("POST", `/api/vakter/${vaktId}/godkjenn`, { ansattId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/vakter"] });
      queryClient.invalidateQueries({ queryKey: ["/api/vakt-interesser"] });
      toast({ title: "Vakt godkjent og tildelt!" });
    },
    onError: () => {
      toast({
        title: "Kunne ikke godkjenne vakten",
        description: "Prøv igjen. Vakten kan allerede være tildelt.",
        variant: "destructive",
      });
    },
  });

  const godkjennTimer = useMutation({
    mutationFn: (vaktId: string) =>
      apiRequest("POST", `/api/vakter/${vaktId}/godkjenn-timer`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/vakter"] });
      toast({ title: "Timer godkjent!" });
    },
    onError: () => {
      toast({ title: "Feil", description: "Kunne ikke godkjenne timer", variant: "destructive" });
    },
  });

  const formatDate = (d: string) => {
    const date = new Date(d + "T00:00:00");
    return date.toLocaleDateString("nb-NO", { weekday: "short", day: "numeric", month: "short" });
  };

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-bold">Godkjenn</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {tab === "interesse"
            ? isLoading
              ? "Laster ledige vakter…"
              : isError
                ? "Kunne ikke hente ledige vakter"
                : `${åpneVakter.length} ledige vakter totalt${antallMedInteresse === null ? "" : ` · ${antallMedInteresse} med forespørsler · ${antallUtenInteresse} uten forespørsler`}`
            : `${vakterMedTimerInnsendt.length} vakter med innsendte timer`}
        </p>
      </header>

      <div className="grid grid-cols-2 gap-2" role="tablist" aria-label="Godkjenningskø">
        <Button
          type="button"
          variant={tab === "interesse" ? "default" : "outline"}
          size="sm"
          onClick={() => setTab("interesse")}
          data-testid="tab-interesse"
          role="tab"
          aria-selected={tab === "interesse"}
          className="w-full"
        >
          <Users className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
          Vakter ({isError ? "—" : åpneVakter.length})
        </Button>
        <Button
          type="button"
          variant={tab === "timer" ? "default" : "outline"}
          size="sm"
          onClick={() => setTab("timer")}
          data-testid="tab-timer"
          role="tab"
          aria-selected={tab === "timer"}
          className="w-full"
        >
          <Send className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
          Timer ({vakterMedTimerInnsendt.length})
        </Button>
      </div>

      {tab === "interesse" ? (
        isLoading ? (
          <div className="space-y-3" aria-label="Laster ledige vakter">
            {[1, 2].map((item) => <Skeleton key={item} className="h-48 w-full rounded-md" />)}
          </div>
        ) : isError ? (
          <Card>
            <CardContent className="flex flex-col items-center py-10 text-center">
              <AlertCircle className="mb-3 h-10 w-10 text-destructive" aria-hidden="true" />
              <p className="font-medium">Kunne ikke hente vaktene</p>
              <p className="mt-1 text-sm text-muted-foreground">Listen er ikke tilgjengelig akkurat nå.</p>
              <Button className="mt-4" variant="outline" size="sm" onClick={() => refetch()}>
                Prøv igjen
              </Button>
            </CardContent>
          </Card>
        ) : åpneVakter.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <CheckCircle2 className="mx-auto mb-3 h-10 w-10 text-muted-foreground" aria-hidden="true" />
              <p className="font-medium">Ingen ledige vakter</p>
              <p className="mt-1 text-sm text-muted-foreground">Alle vakter er tildelt akkurat nå.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {åpneVakter.map((vakt) => {
              const barnehage = bhMap.get(vakt.barnehageId);
              const interesser = interesserByVakt.get(vakt.id) || [];
              return (
                <Card key={vakt.id} data-testid={`card-pending-${vakt.id}`}>
                  <CardContent className="p-4">
                    <div className="mb-3 flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h2 className="text-sm font-semibold">{barnehage?.name || "Ukjent barnehage"}</h2>
                        <span className="mt-1 inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800 dark:bg-amber-900 dark:text-amber-200">
                          {vakt.vikarkode}
                        </span>
                      </div>
                      <span className="inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                        <Users className="h-3.5 w-3.5" aria-hidden="true" />
                        {interesserQuery.isLoading
                          ? "Laster forespørsler"
                          : interesserQuery.isError
                            ? "Forespørsler utilgjengelige"
                            : interesser.length > 0
                              ? `${interesser.length} interessert${interesser.length !== 1 ? "e" : ""}`
                              : "Ingen forespørsler"}
                      </span>
                    </div>

                    <div className="mb-4 space-y-2 text-sm">
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Calendar className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                        <span>{formatDate(vakt.dato)}</span>
                      </div>
                      <div className="flex items-start gap-2 text-muted-foreground">
                        <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                        <span>
                          {vakt.startTid?.slice(0, 5)} - {vakt.sluttTid?.slice(0, 5)}
                          {" · "}
                          {calculatePaidHours(vakt.startTid, vakt.sluttTid, vakt).toFixed(1)} betalte timer
                          {vakt.avtalteBetalteTimer !== null && vakt.avtalteBetalteTimer !== undefined
                            ? " · avtalte betalte timer"
                            : shouldDeductPause(vakt.startTid, vakt.sluttTid, vakt)
                              ? " · 30m ubetalt pause"
                              : vakt.betaltPause
                                ? " · betalt pause"
                                : ""}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Building2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                        <span>{vakt.region}</span>
                      </div>
                    </div>

                    {interesserQuery.isLoading ? (
                      <div className="space-y-2 border-t pt-3" aria-label="Laster forespørsler">
                        <Skeleton className="h-4 w-36" />
                        <Skeleton className="h-11 w-full" />
                      </div>
                    ) : interesserQuery.isError ? (
                      <div className="border-t pt-3">
                        <div className="flex flex-col items-start justify-between gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 sm:flex-row sm:items-center">
                          <p className="flex items-start gap-2 text-sm text-destructive" role="alert">
                            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                            Kunne ikke hente forespørsler for vaktene.
                          </p>
                          <Button variant="outline" size="sm" onClick={() => interesserQuery.refetch()}>
                            Prøv igjen
                          </Button>
                        </div>
                      </div>
                    ) : interesser.length > 0 ? (
                      <div className="space-y-2 border-t pt-3">
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          Interesserte ansatte
                        </p>
                        {interesser.map((interesse) => {
                          const ansatt = userMap.get(interesse.ansattId);
                          const initials = ansatt?.name
                            ?.split(" ")
                            .map((name) => name[0])
                            .join("")
                            .slice(0, 2)
                            .toUpperCase() || "?";
                          const isApproving =
                            godkjenn.isPending &&
                            godkjenn.variables?.vaktId === vakt.id &&
                            godkjenn.variables?.ansattId === interesse.ansattId;
                          return (
                            <div
                              key={interesse.id}
                              className="flex flex-col gap-2 rounded-md bg-muted/50 p-2 sm:flex-row sm:items-center sm:justify-between"
                            >
                              <div className="flex min-w-0 items-center gap-2">
                                <Avatar className="h-7 w-7 shrink-0">
                                  {ansatt?.profileImage && <AvatarImage src={ansatt.profileImage} alt={ansatt.name} />}
                                  <AvatarFallback className="bg-primary text-[10px] font-bold text-primary-foreground">
                                    {initials}
                                  </AvatarFallback>
                                </Avatar>
                                <span className="truncate text-sm font-medium">{ansatt?.name || "Ukjent ansatt"}</span>
                                {ansatt?.stilling && (
                                  <span className="text-xs text-muted-foreground">({ansatt.stilling})</span>
                                )}
                              </div>
                              <Button
                                type="button"
                                data-testid={`button-godkjenn-${vakt.id}-${interesse.ansattId}`}
                                size="sm"
                                onClick={() => godkjenn.mutate({ vaktId: vakt.id, ansattId: interesse.ansattId })}
                                disabled={godkjenn.isPending}
                              >
                                <Check className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                                {isApproving ? "Godkjenner…" : "Velg"}
                              </Button>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="border-t pt-3 text-sm text-muted-foreground">Ingen forespørsler på denne vakten.</p>
                    )}

                    <AvailableShiftCandidates
                      vakt={vakt}
                      kindergartenName={barnehage?.name || "Ukjent barnehage"}
                    />
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )
      ) : (
        vakterQuery.isLoading ? (
          <div className="space-y-3" aria-label="Laster timer">
            {[1, 2].map((item) => <Skeleton key={item} className="h-40 w-full rounded-md" />)}
          </div>
        ) : vakterQuery.isError ? (
          <Card>
            <CardContent className="flex flex-col items-center py-10 text-center">
              <AlertCircle className="mb-3 h-10 w-10 text-destructive" aria-hidden="true" />
              <p className="font-medium">Kunne ikke hente vaktene</p>
              <p className="mt-1 text-sm text-muted-foreground">Timer kan ikke vises akkurat nå.</p>
              <Button className="mt-4" variant="outline" size="sm" onClick={() => refetch()}>
                Prøv igjen
              </Button>
            </CardContent>
          </Card>
        ) : vakterMedTimerInnsendt.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <AlertCircle className="mx-auto mb-3 h-10 w-10 text-muted-foreground" aria-hidden="true" />
              <p className="font-medium">Ingen timer venter</p>
              <p className="mt-1 text-sm text-muted-foreground">Ingen ansatte har sendt inn timer for godkjenning.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {vakterMedTimerInnsendt.map((vakt) => {
              const barnehage = bhMap.get(vakt.barnehageId);
              const ansatt = vakt.ansattId ? userMap.get(vakt.ansattId) : null;
              const isPending = godkjennTimer.isPending && godkjennTimer.variables === vakt.id;
              return (
                <Card key={vakt.id} data-testid={`card-timer-${vakt.id}`}>
                  <CardContent className="p-4">
                    <div className="mb-3 flex items-start justify-between gap-2">
                      <div>
                        <h2 className="text-sm font-semibold">{barnehage?.name || "Ukjent"}</h2>
                        <span className="mt-1 inline-flex rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                          Timer innsendt
                        </span>
                      </div>
                      {vakt.timerInnsendtAt && (
                        <span className="text-xs text-muted-foreground">
                          {new Date(vakt.timerInnsendtAt).toLocaleDateString("nb-NO", { day: "numeric", month: "short" })}
                        </span>
                      )}
                    </div>

                    {ansatt && (
                      <div className="mb-3 flex items-center gap-2">
                        <Avatar className="h-7 w-7 shrink-0">
                          {ansatt.profileImage && <AvatarImage src={ansatt.profileImage} alt={ansatt.name} />}
                          <AvatarFallback className="bg-primary text-[10px] font-bold text-primary-foreground">
                            {ansatt.name.split(" ").map((name) => name[0]).join("").slice(0, 2).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <span className="text-sm font-medium">{ansatt.name}</span>
                        <span className="text-xs text-muted-foreground">({ansatt.stilling})</span>
                      </div>
                    )}

                    <div className="mb-4 space-y-2 text-sm">
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Calendar className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>{formatDate(vakt.dato)}</span>
                      </div>
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>{vakt.startTid?.slice(0, 5)} - {vakt.sluttTid?.slice(0, 5)}</span>
                      </div>
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Building2 className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>{vakt.region}</span>
                      </div>
                    </div>

                    <Button
                      className="w-full"
                      size="sm"
                      onClick={() => godkjennTimer.mutate(vakt.id)}
                      disabled={isPending}
                      data-testid={`button-godkjenn-timer-${vakt.id}`}
                    >
                      <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                      {isPending ? "Godkjenner…" : "Godkjenn timer"}
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )
      )}
    </div>
  );
}
