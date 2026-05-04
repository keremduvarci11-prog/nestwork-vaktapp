import { useMemo, useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Users, Calendar, Clock, TrendingUp, List } from "lucide-react";
import { Link } from "wouter";
import type { Vakt, Barnehage, User } from "@shared/schema";
import { PushPermissionBanner } from "@/components/push-banner";

function osloNow(): { todayIso: string; nowMinutes: number } {
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Oslo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(new Date());
  const p = (t: string) => parts.find((x) => x.type === t)?.value ?? "0";
  const todayIso = `${p("year")}-${p("month")}-${p("day")}`;
  const nowMinutes = Number(p("hour")) * 60 + Number(p("minute"));
  return { todayIso, nowMinutes };
}

function isVaktActive(vakt: Vakt): boolean {
  const { todayIso, nowMinutes } = osloNow();
  if (vakt.dato > todayIso) return true;
  if (vakt.dato < todayIso) return false;
  if (vakt.sluttTid) {
    const [eh, em] = vakt.sluttTid.split(":").map(Number);
    return nowMinutes <= eh * 60 + em;
  }
  return true;
}

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

  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 60000);
    return () => clearInterval(id);
  }, []);

  const { todayIso: today } = osloNow();
  const now = new Date();
  const dayOfWeek = now.getDay();
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const thisWeekStart = new Date(now);
  thisWeekStart.setDate(now.getDate() + mondayOffset);
  const thisWeekEnd = new Date(thisWeekStart);
  thisWeekEnd.setDate(thisWeekStart.getDate() + 6);
  const weekStart = thisWeekStart.toISOString().split("T")[0];
  const weekEnd = thisWeekEnd.toISOString().split("T")[0];

  const activeVakter = useMemo(() => {
    const list = vakter?.filter((v) => isVaktActive(v) && (v.status === "godkjent" || v.status === "venter" || v.status === "tildelt")) || [];
    return list.slice().sort((a, b) => {
      if (a.dato !== b.dato) return a.dato < b.dato ? -1 : 1;
      const at = a.startTid || "00:00";
      const bt = b.startTid || "00:00";
      return at < bt ? -1 : at > bt ? 1 : 0;
    });
  }, [vakter, tick]);
  const ledigeVakter = useMemo(() => vakter?.filter((v) => isVaktActive(v) && v.status === "ledig") || [], [vakter, tick]);
  const venterVakter = vakter?.filter((v) => v.status === "venter") || [];
  const tildelteVakter = useMemo(() => vakter?.filter((v) => isVaktActive(v) && v.status === "tildelt") || [], [vakter, tick]);
  const weekVakter = vakter?.filter((v) => v.dato >= weekStart && v.dato <= weekEnd && v.status === "godkjent") || [];

  const calcHours = (start: string, end: string, trekkPause?: boolean | null) => {
    const [sh, sm] = start.split(":").map(Number);
    const [eh, em] = end.split(":").map(Number);
    let hours = (eh * 60 + em - sh * 60 - sm) / 60;
    if (trekkPause) hours -= 0.5;
    return Math.max(0, hours);
  };

  const weekHours = weekVakter.reduce((sum, v) => sum + calcHours(v.startTid, v.sluttTid, v.trekkPause), 0);

  const bhMap = new Map(barnehager?.map((b) => [b.id, b]) || []);
  const userMap = new Map(users?.map((u) => [u.id, u]) || []);

  const ansatte = users?.filter((u) => u.role === "ansatt") || [];

  return (
    <div className="space-y-6">
      <PushPermissionBanner compact />

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
              <div className="flex items-baseline justify-between mb-3">
                <h2 className="text-sm font-semibold">Hvem jobber hvor</h2>
                <span className="text-xs text-muted-foreground" data-testid="text-active-count">{activeVakter.length} kommende</span>
              </div>
              <div className="space-y-4">
                {Object.entries(
                  activeVakter.reduce<Record<string, Vakt[]>>((acc, v) => {
                    (acc[v.dato] = acc[v.dato] || []).push(v);
                    return acc;
                  }, {})
                ).map(([dato, dayVakter]) => {
                  const date = new Date(dato + "T00:00:00");
                  const isToday = dato === today;
                  const dateLabel = isToday
                    ? "I dag"
                    : date.toLocaleDateString("nb-NO", { weekday: "short", day: "numeric", month: "short" });
                  return (
                    <div key={dato}>
                      <div className="flex items-center gap-2 mb-1.5 px-1">
                        <p className={`text-xs font-semibold uppercase tracking-wide ${isToday ? "text-primary" : "text-muted-foreground"}`}>{dateLabel}</p>
                        <div className="h-px flex-1 bg-border" />
                        <span className="text-[10px] text-muted-foreground">{dayVakter.length}</span>
                      </div>
                      <div className="space-y-1.5">
                        {dayVakter.map((v) => {
                          const bh = bhMap.get(v.barnehageId);
                          const emp = v.ansattId ? userMap.get(v.ansattId) : null;
                          return (
                            <Card key={v.id} data-testid={`card-vakt-${v.id}`}>
                              <CardContent className="p-2.5">
                                <div className="flex items-center justify-between gap-2">
                                  <div className="flex items-center gap-2 min-w-0">
                                    {emp ? (
                                      <Avatar className="w-7 h-7 flex-shrink-0">
                                        {emp.profileImage && <AvatarImage src={emp.profileImage} alt={emp.name} />}
                                        <AvatarFallback className="bg-primary text-primary-foreground text-[10px] font-bold">
                                          {emp.name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase()}
                                        </AvatarFallback>
                                      </Avatar>
                                    ) : (
                                      <div className="w-7 h-7 flex-shrink-0 rounded-full bg-muted flex items-center justify-center">
                                        <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                                      </div>
                                    )}
                                    <div className="min-w-0">
                                      <p className="text-sm font-medium truncate leading-tight">{emp?.name || "Venter..."}</p>
                                      <p className="text-xs text-muted-foreground truncate leading-tight">{bh?.name}</p>
                                    </div>
                                  </div>
                                  <div className="text-right flex-shrink-0">
                                    <p className="text-xs font-medium tabular-nums">{v.startTid?.slice(0, 5)}–{v.sluttTid?.slice(0, 5)}</p>
                                  </div>
                                </div>
                              </CardContent>
                            </Card>
                          );
                        })}
                      </div>
                    </div>
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
