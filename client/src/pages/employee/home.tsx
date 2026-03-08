import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { MapPin, Clock, Calendar, Building2, AlertCircle } from "lucide-react";
import type { Vakt, Barnehage } from "@shared/schema";

const vikarkodeLabels: Record<string, string> = {
  KTV: "Korttidsvikar",
  LTV: "Langtidsvikar",
  "LTV-NAV": "NAV-tiltak",
  RES: "Reserve",
};

const vikarkodeColors: Record<string, string> = {
  KTV: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  LTV: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  "LTV-NAV": "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
  RES: "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200",
};

export default function EmployeeHome() {
  const { user } = useAuth();
  const { toast } = useToast();

  const { data: vakter, isLoading: vLoading } = useQuery<Vakt[]>({
    queryKey: ["/api/vakter", `?region=${user?.region}`],
  });

  const { data: barnehager } = useQuery<Barnehage[]>({
    queryKey: ["/api/barnehager"],
  });

  const taVaktMutation = useMutation({
    mutationFn: (vaktId: string) =>
      apiRequest("POST", `/api/vakter/${vaktId}/ta`, { ansattId: user?.id }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/vakter"] });
      toast({ title: "Vakt registrert!", description: "Venter på godkjenning fra admin." });
    },
    onError: () => {
      toast({ title: "Feil", description: "Kunne ikke ta vakten", variant: "destructive" });
    },
  });

  const bhMap = new Map(barnehager?.map((b) => [b.id, b]) || []);
  const today = new Date().toISOString().split("T")[0];
  const ledigeVakter = vakter?.filter((v) => v.status === "ledig" && v.dato >= today) || [];

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
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <h3 className="font-semibold text-sm truncate">{bh?.name || "Ukjent"}</h3>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${vikarkodeColors[vakt.vikarkode] || vikarkodeColors.RES}`}>
                          {vakt.vikarkode}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">{vikarkodeLabels[vakt.vikarkode]}</p>
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
