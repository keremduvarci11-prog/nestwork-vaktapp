import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Check, X, Calendar, Clock, Building2, User, AlertCircle } from "lucide-react";
import type { Vakt, Barnehage, User as UserType } from "@shared/schema";

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

  const bhMap = new Map(barnehager?.map((b) => [b.id, b]) || []);
  const userMap = new Map(users?.map((u) => [u.id, u]) || []);
  const venterVakter = vakter?.filter((v) => v.status === "venter") || [];

  const godkjenn = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/vakter/${id}/godkjenn`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/vakter"] });
      toast({ title: "Vakt godkjent!" });
    },
  });

  const avslaa = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/vakter/${id}/avslaa`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/vakter"] });
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
        <p className="text-sm text-muted-foreground mt-1">{venterVakter.length} venter på godkjenning</p>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2].map((i) => <Skeleton key={i} className="h-40 w-full rounded-md" />)}
        </div>
      ) : venterVakter.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <AlertCircle className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
            <p className="font-medium">Ingen vakter venter</p>
            <p className="text-sm text-muted-foreground mt-1">Alle forespørsler er behandlet.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {venterVakter.map((vakt) => {
            const bh = bhMap.get(vakt.barnehageId);
            const emp = vakt.ansattId ? userMap.get(vakt.ansattId) : null;
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
                  </div>

                  <div className="space-y-2 mb-4 text-sm">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <User className="w-3.5 h-3.5" />
                      <span className="font-medium text-foreground">{emp?.name || "Ukjent ansatt"}</span>
                      <span className="text-xs">({emp?.stilling})</span>
                    </div>
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

                  <div className="flex gap-2">
                    <Button
                      data-testid={`button-godkjenn-${vakt.id}`}
                      className="flex-1"
                      onClick={() => godkjenn.mutate(vakt.id)}
                      disabled={godkjenn.isPending}
                    >
                      <Check className="w-4 h-4 mr-1" />
                      Godkjenn
                    </Button>
                    <Button
                      data-testid={`button-avslaa-${vakt.id}`}
                      variant="secondary"
                      className="flex-1"
                      onClick={() => avslaa.mutate(vakt.id)}
                      disabled={avslaa.isPending}
                    >
                      <X className="w-4 h-4 mr-1" />
                      Avslå
                    </Button>
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
