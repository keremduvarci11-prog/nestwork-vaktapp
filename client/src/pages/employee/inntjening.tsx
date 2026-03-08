import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { DollarSign, Clock, TrendingUp } from "lucide-react";
import type { Vakt } from "@shared/schema";

export default function Inntjening() {
  const { user } = useAuth();

  const { data: vakter, isLoading } = useQuery<Vakt[]>({
    queryKey: ["/api/vakter/mine", user?.id],
  });

  const today = new Date();
  const currentMonth = today.getMonth();
  const currentYear = today.getFullYear();
  const timelonn = parseFloat(user?.timelonn || "0");

  const monthVakter = vakter?.filter((v) => {
    const d = new Date(v.dato + "T00:00:00");
    return d.getMonth() === currentMonth && d.getFullYear() === currentYear && v.status === "godkjent";
  }) || [];

  const calcHours = (start: string, end: string) => {
    const [sh, sm] = start.split(":").map(Number);
    const [eh, em] = end.split(":").map(Number);
    return (eh * 60 + em - sh * 60 - sm) / 60;
  };

  const totalHours = monthVakter.reduce((sum, v) => sum + calcHours(v.startTid, v.sluttTid), 0);
  const totalEarnings = totalHours * timelonn;

  const monthName = today.toLocaleDateString("nb-NO", { month: "long", year: "numeric" });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">Inntjening</h1>
        <p className="text-sm text-muted-foreground mt-1 capitalize">{monthName}</p>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-24 w-full rounded-md" />)}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <DollarSign className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Total inntjening</p>
                    <p className="text-2xl font-bold" data-testid="text-total-earnings">
                      {totalEarnings.toLocaleString("nb-NO")} kr
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="grid grid-cols-2 gap-3">
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-muted-foreground" />
                    <div>
                      <p className="text-xs text-muted-foreground">Timer</p>
                      <p className="text-lg font-bold">{totalHours.toFixed(1)}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-muted-foreground" />
                    <div>
                      <p className="text-xs text-muted-foreground">Timelonn</p>
                      <p className="text-lg font-bold">{timelonn} kr</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>

          {monthVakter.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold mb-3">Vakter denne måneden</h2>
              <div className="space-y-2">
                {monthVakter.map((v) => {
                  const hours = calcHours(v.startTid, v.sluttTid);
                  const date = new Date(v.dato + "T00:00:00");
                  return (
                    <div key={v.id} className="flex items-center justify-between py-2 border-b last:border-0">
                      <div>
                        <p className="text-sm font-medium">{date.toLocaleDateString("nb-NO", { day: "numeric", month: "short" })}</p>
                        <p className="text-xs text-muted-foreground">{v.startTid?.slice(0, 5)} - {v.sluttTid?.slice(0, 5)}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-medium">{(hours * timelonn).toLocaleString("nb-NO")} kr</p>
                        <p className="text-xs text-muted-foreground">{hours.toFixed(1)} timer</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
