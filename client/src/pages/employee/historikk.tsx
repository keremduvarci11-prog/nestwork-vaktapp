import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Calendar, Clock, Building2, AlertCircle } from "lucide-react";
import type { Vakt, Barnehage } from "@shared/schema";

export default function Historikk() {
  const { user } = useAuth();

  const { data: vakter, isLoading } = useQuery<Vakt[]>({
    queryKey: ["/api/vakter/mine", user?.id],
  });

  const { data: barnehager } = useQuery<Barnehage[]>({
    queryKey: ["/api/barnehager"],
  });

  const bhMap = new Map(barnehager?.map((b) => [b.id, b]) || []);
  const today = new Date().toISOString().split("T")[0];
  const historiske = vakter?.filter((v) => v.dato < today && v.status === "godkjent") || [];

  const formatDate = (d: string) => {
    const date = new Date(d + "T00:00:00");
    return date.toLocaleDateString("nb-NO", { weekday: "short", day: "numeric", month: "short" });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">Vakthistorikk</h1>
        <p className="text-sm text-muted-foreground mt-1">{historiske.length} fullførte vakter</p>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2].map((i) => <Skeleton key={i} className="h-28 w-full rounded-md" />)}
        </div>
      ) : historiske.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <AlertCircle className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
            <p className="font-medium">Ingen historikk ennå</p>
            <p className="text-sm text-muted-foreground mt-1">Fullførte vakter vil vises her.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {historiske.map((vakt) => {
            const bh = bhMap.get(vakt.barnehageId);
            return (
              <Card key={vakt.id} className="opacity-80">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <h3 className="font-semibold text-sm">{bh?.name || "Ukjent"}</h3>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">{vakt.vikarkode}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-sm text-muted-foreground">
                    <div className="flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5" />
                      <span>{formatDate(vakt.dato)}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5" />
                      <span>{vakt.startTid?.slice(0, 5)} - {vakt.sluttTid?.slice(0, 5)}</span>
                    </div>
                    <div className="flex items-center gap-1.5 col-span-2">
                      <Building2 className="w-3.5 h-3.5" />
                      <span className="truncate">{bh?.address}</span>
                    </div>
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
