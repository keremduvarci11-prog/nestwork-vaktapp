import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { AlertCircle, CalendarDays, Check, ChevronDown, Clock3, Loader2, Users } from "lucide-react";
import type { Vakt } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";

type AvailableCandidate = {
  userId: string;
  name: string;
  stilling: string;
  region: string;
  hasRequested: boolean;
};

type AvailableCandidatesResponse = {
  blocked: boolean;
  employees: AvailableCandidate[];
};

type AvailableShiftCandidatesProps = {
  vakt: Vakt;
  kindergartenName: string;
};

function formatDate(date: string) {
  return new Date(`${date}T00:00:00`).toLocaleDateString("nb-NO", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export function AvailableShiftCandidates({ vakt, kindergartenName }: AvailableShiftCandidatesProps) {
  const { toast } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const [selectedCandidate, setSelectedCandidate] = useState<AvailableCandidate | null>(null);
  const [assignmentError, setAssignmentError] = useState("");
  const candidatesKey = ["/api/vakter", vakt.id, "tilgjengelige"];

  const candidatesQuery = useQuery<AvailableCandidatesResponse>({
    queryKey: candidatesKey,
    enabled: isOpen,
    staleTime: 0,
    refetchInterval: isOpen ? 60_000 : false,
  });

  const invalidateAvailabilityContext = () => {
    queryClient.setQueryData<AvailableCandidatesResponse>(candidatesKey, {
      blocked: false,
      employees: [],
    });
    queryClient.invalidateQueries({ queryKey: candidatesKey, exact: true });
    queryClient.invalidateQueries({ queryKey: ["/api/vakter"] });
    queryClient.invalidateQueries({ queryKey: ["/api/vakt-interesser"] });
  };

  const assignCandidate = useMutation({
    mutationFn: (candidate: AvailableCandidate) =>
      apiRequest("POST", `/api/vakter/${vakt.id}/tildel`, {
        ansattId: candidate.userId,
        fromAvailability: true,
      }),
    onSuccess: (_response, candidate) => {
      setSelectedCandidate(null);
      setAssignmentError("");
      toast({
        title: "Vakt tildelt",
        description: `${candidate.name} må fortsatt godta vakten.`,
      });
    },
    onError: (error: Error) => {
      setAssignmentError(error.message || "Kunne ikke tildele vakten. Prøv igjen.");
    },
    onSettled: () => {
      invalidateAvailabilityContext();
    },
  });

  const openConfirmation = (candidate: AvailableCandidate) => {
    setAssignmentError("");
    setSelectedCandidate(candidate);
  };

  const closeConfirmation = () => {
    if (assignCandidate.isPending) return;
    setSelectedCandidate(null);
    setAssignmentError("");
  };

  return (
    <section className="mt-3 overflow-hidden rounded-md border border-border/80 bg-muted/20">
      <button
        type="button"
        className="flex min-h-11 w-full items-center justify-between gap-3 px-3 py-2 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
        aria-expanded={isOpen}
        aria-controls={`available-candidates-${vakt.id}`}
        data-testid={`available-candidates-toggle-${vakt.id}`}
        onClick={() => setIsOpen((open) => !open)}
      >
        <span className="flex min-w-0 items-center gap-2">
          <Users className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
          <span className="text-sm font-semibold">Tilgjengelige denne dagen</span>
          {isOpen && candidatesQuery.data && !candidatesQuery.data.blocked && (
            <span className="shrink-0 rounded-full bg-background px-2 py-0.5 text-xs text-muted-foreground">
              {candidatesQuery.data.employees.length}
            </span>
          )}
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${isOpen ? "rotate-180" : ""}`} aria-hidden="true" />
      </button>

      {isOpen && (
        <div id={`available-candidates-${vakt.id}`} className="space-y-3 border-t px-3 py-3">
          <p className="text-xs leading-relaxed text-muted-foreground">
            Kalendermerking er ikke en vaktforespørsel. Den ansatte må fortsatt godta vakten etter tildeling.
          </p>

          {candidatesQuery.isLoading ? (
            <div className="space-y-2" aria-label="Laster tilgjengelige ansatte">
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-14 w-full" />
            </div>
          ) : candidatesQuery.isError ? (
            <div className="flex flex-col items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="flex items-start gap-2 text-sm text-destructive" role="alert">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <span>Kunne ikke hente tilgjengelige ansatte.</span>
              </p>
              <Button variant="outline" size="sm" onClick={() => candidatesQuery.refetch()}>
                Prøv igjen
              </Button>
            </div>
          ) : candidatesQuery.data?.blocked ? (
            <div className="rounded-md border border-amber-300/70 bg-amber-50/70 px-3 py-3 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100">
              Tilgjengelighetsoversikten er blokkert for denne datoen.
            </div>
          ) : !candidatesQuery.data?.employees.length ? (
            <div className="rounded-md border border-border/70 bg-background/70 px-3 py-3 text-sm text-muted-foreground">
              Ingen ansatte har markert seg tilgjengelige denne dagen.
            </div>
          ) : (
            <ul className="space-y-2">
              {candidatesQuery.data.employees.map((candidate) => (
                <li
                  key={candidate.userId}
                  className="flex flex-col gap-3 rounded-md border border-border/70 bg-background p-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{candidate.name}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {candidate.stilling} · {candidate.region}
                    </p>
                    <span className={`mt-2 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                      candidate.hasRequested
                        ? "bg-primary/10 text-primary"
                        : "bg-muted text-muted-foreground"
                    }`}>
                      {candidate.hasRequested ? "Har sendt forespørsel" : "Kun markert tilgjengelig"}
                    </span>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full shrink-0 sm:w-auto"
                    onClick={() => openConfirmation(candidate)}
                    disabled={assignCandidate.isPending}
                    data-testid={`candidate-assign-${candidate.userId}`}
                  >
                    <Check className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                    Tildel
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <AlertDialog
        open={selectedCandidate !== null}
        onOpenChange={(open) => {
          if (!open) closeConfirmation();
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Bekreft tildeling</AlertDialogTitle>
            <AlertDialogDescription>
              Du tildeler vakten til {selectedCandidate?.name || "den valgte ansatte"}. Den ansatte må godta vakten før den er bekreftet.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2 rounded-md border bg-muted/30 p-3 text-sm">
            <p className="font-semibold">{selectedCandidate?.name}</p>
            <p className="flex items-start gap-2 text-muted-foreground">
              <Users className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{kindergartenName}</span>
            </p>
            <p className="flex items-start gap-2 text-muted-foreground">
              <CalendarDays className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{formatDate(vakt.dato)}</span>
            </p>
            <p className="flex items-start gap-2 text-muted-foreground">
              <Clock3 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{vakt.startTid?.slice(0, 5)}–{vakt.sluttTid?.slice(0, 5)}</span>
            </p>
          </div>
          {assignmentError && (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive" role="alert">
              {assignmentError.includes("409")
                ? "Denne tilgjengeligheten er ikke lenger aktuell. Listen oppdateres – åpne den på nytt før du prøver igjen."
                : assignmentError}
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel
              disabled={assignCandidate.isPending}
              onClick={(event) => {
                event.preventDefault();
                closeConfirmation();
              }}
              data-testid="cancel-candidate-assignment"
            >
              Avbryt
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={assignCandidate.isPending || !selectedCandidate}
              onClick={(event) => {
                event.preventDefault();
                if (selectedCandidate && !assignCandidate.isPending) {
                  assignCandidate.mutate(selectedCandidate);
                }
              }}
              data-testid="confirm-candidate-assignment"
            >
              {assignCandidate.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
              {assignCandidate.isPending ? "Tildeler…" : "Bekreft tildeling"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
