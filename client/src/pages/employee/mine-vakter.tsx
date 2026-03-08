import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Calendar, Clock, Building2, CheckCircle2, Timer, AlertCircle } from "lucide-react";
import type { Vakt, Barnehage } from "@shared/schema";

const statusConfig: Record<string, { label: string; className: string; icon: typeof CheckCircle2 }> = {
  venter: { label: "Venter", className: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200", icon: Timer },
  godkjent: { label: "Godkjent", className: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200", icon: CheckCircle2 },
};

export default function MineVakter() {
  const { user } = useAuth();

  const { data: vakter, isLoading } = useQuery<Vakt[]>({
    queryKey: ["/api/vakter/mine", user?.id],
  });

  const { data: barnehager } = useQuery<Barnehage[]>({
    queryKey: ["/api/barnehager"],
  });

  const bhMap = new Map(barnehager?.map((b) => [b.id, b]) || []);
  const today = new Date().toISOString().split("T")[0];
  const kommendeVakter = vakter?.filter((v) => v.dato >= today && (v.status === "godkjent" || v.status === "venter")) || [];

  const formatDate = (d: string) => {
    const date = new Date(d + "T00:00:00");
    return date.toLocaleDateString("nb-NO", { weekday: "short", day: "numeric", month: "short" });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">Mine vakter</h1>
        <p className="text-sm text-muted-foreground mt-1">{kommendeVakter.length} kommende vakter</p>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2].map((i) => <Skeleton key={i} className="h-32 w-full rounded-md" />)}
        </div>
      ) : kommendeVakter.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <AlertCircle className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
            <p className="font-medium">Ingen kommende vakter</p>
            <p className="text-sm text-muted-foreground mt-1">Du har ingen planlagte vakter.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {kommendeVakter.map((vakt) => {
            const bh = bhMap.get(vakt.barnehageId);
            const config = statusConfig[vakt.status] || statusConfig.venter;
            const Icon = config.icon;
            return (
              <Card key={vakt.id} data-testid={`card-vakt-${vakt.id}`} className="hover-elevate">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <h3 className="font-semibold text-sm">{bh?.name || "Ukjent"}</h3>
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${config.className}`}>
                      <Icon className="w-3 h-3" />
                      {config.label}
                    </span>
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
