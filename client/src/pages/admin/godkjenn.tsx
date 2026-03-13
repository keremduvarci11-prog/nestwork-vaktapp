import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Check, X, Calendar, Clock, Building2, User, AlertCircle, Users } from "lucide-react";
import type { Vakt, Barnehage, User as UserType, VaktInteresse } from "@shared/schema";

export default function GodkjennVakter() {
  const { toast } = useToast();

  const { data: vakter, isLoading } = useQuery<Vakt[]>({
    queryKey: ["/api/vakter"],
  });
  const { data: barnehager } = useQuery<Barnehage[]>({
    queryKey: ["/api/barnehager"],
  });
  const { data: users } = useQuery<UserType[]>({
    queryKey: ["/api/users"],
  });
  const { data: alleInteresser } = useQuery<VaktInteresse[]>({
    queryKey: ["/api/vakt-interesser"],
  });

  const bhMap = new Map(barnehager?.map((b) => [b.id, b]) || []);
  const userMap = new Map(users?.map((u) => [u.id, u]) || []);

  const interesserByVakt = new Map<string, VaktInteresse[]>();
  alleInteresser?.forEach((i) => {
    const list = interesserByVakt.get(i.vaktId) || [];
    list.push(i);
    interesserByVakt.set(i.vaktId, list);
  });

  const vakterMedInteresse = vakter?.filter(
    (v) => v.status === "ledig" && (interesserByVakt.get(v.id)?.length || 0) > 0
  ) || [];

  const godkjenn = useMutation({
    mutationFn: ({ vaktId, ansattId }: { vaktId: string; ansattId: string }) =>
      apiRequest("POST", `/api/vakter/${vaktId}/godkjenn`, { ansattId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/vakter"] });
      queryClient.invalidateQueries({ queryKey: ["/api/vakt-interesser"] });
      toast({ title: "Vakt godkjent og tildelt!" });
    },
  });

  const avslaa = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/vakter/${id}/avslaa`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/vakter"] });
      queryClient.invalidateQueries({ queryKey: ["/api/vakt-interesser"] });
      toast({ title: "Vakt avslått" });
    },
  });

  const formatDate = (d: string) => {
    const date = new Date(d + "T00:00:00");
    return date.toLocaleDateString("nb-NO", { weekday: "short", day: "numeric", month: "short" });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">Godkjenn vakter</h1>
        <p className="text-sm text-muted-foreground mt-1">{vakterMedInteresse.length} vakter med interesserte ansatte</p>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2].map((i) => <Skeleton key={i} className="h-40 w-full rounded-md" />)}
        </div>
      ) : vakterMedInteresse.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <AlertCircle className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
            <p className="font-medium">Ingen vakter venter</p>
            <p className="text-sm text-muted-foreground mt-1">Ingen ansatte har meldt interesse enda.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {vakterMedInteresse.map((vakt) => {
            const bh = bhMap.get(vakt.barnehageId);
            const interesser = interesserByVakt.get(vakt.id) || [];
            return (
              <Card key={vakt.id} data-testid={`card-pending-${vakt.id}`}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div>
                      <h3 className="font-semibold text-sm">{bh?.name || "Ukjent"}</h3>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200">
                        {vakt.vikarkode}
                      </span>
                    </div>
                    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                      <Users className="w-3.5 h-3.5" />
                      {interesser.length} interessert{interesser.length !== 1 ? "e" : ""}
                    </span>
                  </div>

                  <div className="space-y-2 mb-4 text-sm">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Calendar className="w-3.5 h-3.5" />
                      <span>{formatDate(vakt.dato)}</span>
                    </div>
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Clock className="w-3.5 h-3.5" />
                      <span>{vakt.startTid?.slice(0, 5)} - {vakt.sluttTid?.slice(0, 5)}</span>
                    </div>
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Building2 className="w-3.5 h-3.5" />
                      <span>{vakt.region}</span>
                    </div>
                  </div>

                  <div className="border-t pt-3 space-y-2">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Interesserte ansatte</p>
                    {interesser.map((interesse) => {
                      const emp = userMap.get(interesse.ansattId);
                      return (
                        <div key={interesse.id} className="flex items-center justify-between gap-2 p-2 rounded-md bg-muted/50">
                          <div className="flex items-center gap-2 min-w-0">
                            <User className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                            <span className="text-sm font-medium truncate">{emp?.name || "Ukjent"}</span>
                            <span className="text-xs text-muted-foreground">({emp?.stilling})</span>
                          </div>
                          <Button
                            data-testid={`button-godkjenn-${vakt.id}-${interesse.ansattId}`}
                            size="sm"
                            onClick={() => godkjenn.mutate({ vaktId: vakt.id, ansattId: interesse.ansattId })}
                            disabled={godkjenn.isPending}
                          >
                            <Check className="w-3.5 h-3.5 mr-1" />
                            Velg
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
