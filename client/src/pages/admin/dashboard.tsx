import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Users, Calendar, Clock, TrendingUp, List } from "lucide-react";
import { Link } from "wouter";
import type { Vakt, Barnehage, User } from "@shared/schema";

export default function AdminDashboard() {
  const { data: vakter, isLoading: vLoading } = useQuery<Vakt[]>({
    queryKey: ["/api/vakter"],
  });
  const { data: users } = useQuery<User[]>({
    queryKey: ["/api/users"],
  });
  const { data: barnehager } = useQuery<Barnehage[]>({
    queryKey: ["/api/barnehager"],
  });

  const today = new Date().toISOString().split("T")[0];
  const now = new Date();
  const dayOfWeek = now.getDay();
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const thisWeekStart = new Date(now);
  thisWeekStart.setDate(now.getDate() + mondayOffset);
  const thisWeekEnd = new Date(thisWeekStart);
  thisWeekEnd.setDate(thisWeekStart.getDate() + 6);
  const weekStart = thisWeekStart.toISOString().split("T")[0];
  const weekEnd = thisWeekEnd.toISOString().split("T")[0];

  const activeVakter = vakter?.filter((v) => v.dato >= today && (v.status === "godkjent" || v.status === "venter" || v.status === "tildelt")) || [];
  const ledigeVakter = vakter?.filter((v) => v.dato >= today && v.status === "ledig") || [];
  const venterVakter = vakter?.filter((v) => v.status === "venter") || [];
  const tildelteVakter = vakter?.filter((v) => v.dato >= today && v.status === "tildelt") || [];
  const weekVakter = vakter?.filter((v) => v.dato >= weekStart && v.dato <= weekEnd && v.status === "godkjent") || [];

  const calcHours = (start: string, end: string) => {
    const [sh, sm] = start.split(":").map(Number);
    const [eh, em] = end.split(":").map(Number);
    return (eh * 60 + em - sh * 60 - sm) / 60;
  };

  const weekHours = weekVakter.reduce((sum, v) => sum + calcHours(v.startTid, v.sluttTid), 0);

  const bhMap = new Map(barnehager?.map((b) => [b.id, b]) || []);
  const userMap = new Map(users?.map((u) => [u.id, u]) || []);

  const ansatte = users?.filter((u) => u.role === "ansatt") || [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-1">Oversikt over bemanningen</p>
      </div>

      {vLoading ? (
        <div className="grid grid-cols-2 gap-3">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-24 rounded-md" />)}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Calendar className="w-4 h-4 text-primary" />
                  <p className="text-xs text-muted-foreground">Aktive vakter</p>
                </div>
                <p className="text-2xl font-bold" data-testid="text-active-shifts">{activeVakter.length}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Clock className="w-4 h-4 text-amber-500" />
                  <p className="text-xs text-muted-foreground">Venter godkj.</p>
                </div>
                <p className="text-2xl font-bold" data-testid="text-pending-shifts">{venterVakter.length}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Users className="w-4 h-4 text-blue-500" />
                  <p className="text-xs text-muted-foreground">Ansatte</p>
                </div>
                <p className="text-2xl font-bold">{ansatte.length}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <TrendingUp className="w-4 h-4 text-green-500" />
                  <p className="text-xs text-muted-foreground">Uketimer</p>
                </div>
                <p className="text-2xl font-bold">{weekHours % 1 === 0 ? weekHours : weekHours.toFixed(1)}t</p>
              </CardContent>
            </Card>
          </div>

          <Link href="/admin/alle-vakter">
            <Button variant="outline" className="w-full" data-testid="button-alle-vakter">
              <List className="w-4 h-4 mr-2" />
              Administrer alle vakter
            </Button>
          </Link>

          {activeVakter.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold mb-3">Hvem jobber hvor</h2>
              <div className="space-y-2">
                {activeVakter.slice(0, 8).map((v) => {
                  const bh = bhMap.get(v.barnehageId);
                  const emp = v.ansattId ? userMap.get(v.ansattId) : null;
                  const date = new Date(v.dato + "T00:00:00");
                  return (
                    <Card key={v.id}>
                      <CardContent className="p-3">
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">{emp?.name || "Venter..."}</p>
                            <p className="text-xs text-muted-foreground truncate">{bh?.name}</p>
                          </div>
                          <div className="text-right flex-shrink-0">
                            <p className="text-xs font-medium">{date.toLocaleDateString("nb-NO", { day: "numeric", month: "short" })}</p>
                            <p className="text-xs text-muted-foreground">{v.startTid?.slice(0, 5)}-{v.sluttTid?.slice(0, 5)}</p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          )}

          {ledigeVakter.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold mb-3">Ubesatte vakter ({ledigeVakter.length})</h2>
              <div className="space-y-2">
                {ledigeVakter.slice(0, 5).map((v) => {
                  const bh = bhMap.get(v.barnehageId);
                  const date = new Date(v.dato + "T00:00:00");
                  return (
                    <Card key={v.id}>
                      <CardContent className="p-3">
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">{bh?.name}</p>
                            <p className="text-xs text-muted-foreground">{v.vikarkode} - {v.region}</p>
                          </div>
                          <div className="text-right flex-shrink-0">
                            <p className="text-xs font-medium">{date.toLocaleDateString("nb-NO", { day: "numeric", month: "short" })}</p>
                            <p className="text-xs text-muted-foreground">{v.startTid?.slice(0, 5)}-{v.sluttTid?.slice(0, 5)}</p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
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
