import { useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ArrowLeft, ChevronLeft, ChevronRight, Lock, Unlock, Loader2 } from "lucide-react";

const MONTH_NAMES_NB = [
  "Januar", "Februar", "Mars", "April", "Mai", "Juni",
  "Juli", "August", "September", "Oktober", "November", "Desember",
];
const WEEKDAYS = ["Man", "Tir", "Ons", "Tor", "Fre", "Lør", "Søn"];

function pad(n: number) {
  return String(n).padStart(2, "0");
}

interface BlockedRow {
  date: string;
  reason: string | null;
}

interface AvailableEmployee {
  userId: string;
  name: string;
  stilling: string;
  region: string;
  profileImage: string | null;
  status: "available" | "assigned";
}

interface ByDateResponse {
  blocked: boolean;
  employees: AvailableEmployee[];
}

export default function AdminTilgjengelighet() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [cursor, setCursor] = useState<{ y: number; m: number }>(() => {
    const d = new Date();
    return { y: d.getFullYear(), m: d.getMonth() + 1 };
  });
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [reason, setReason] = useState<string>("");

  const monthKey = `${cursor.y}-${pad(cursor.m)}`;

  const { data: blockedRows = [] } = useQuery<BlockedRow[]>({
    queryKey: ["/api/blocked-dates", monthKey],
    queryFn: async () => {
      const r = await fetch(`/api/blocked-dates?month=${monthKey}`, { credentials: "include" });
      if (!r.ok) throw new Error("Kunne ikke hente blokkerte dager");
      return r.json();
    },
  });

  const { data: dayData, isLoading: dayLoading } = useQuery<ByDateResponse>({
    queryKey: ["/api/admin/availability/by-date", selectedDate],
    queryFn: async () => {
      const r = await fetch(`/api/admin/availability/by-date/${selectedDate}`, { credentials: "include" });
      if (!r.ok) throw new Error("Kunne ikke hente data for dato");
      return r.json();
    },
    enabled: !!selectedDate,
  });

  const blockMut = useMutation({
    mutationFn: async ({ date, reason }: { date: string; reason: string }) =>
      apiRequest("POST", "/api/admin/blocked-dates", { date, reason: reason || undefined }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/blocked-dates"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/availability/by-date", selectedDate] });
      toast({ title: "Dato blokkert", description: selectedDate || "" });
      setReason("");
    },
    onError: (err: any) => {
      toast({ title: "Kunne ikke blokkere", description: err?.message || "Ukjent feil", variant: "destructive" });
    },
  });

  const unblockMut = useMutation({
    mutationFn: async (date: string) =>
      apiRequest("DELETE", `/api/admin/blocked-dates/${date}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/blocked-dates"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/availability/by-date", selectedDate] });
      toast({ title: "Blokkering fjernet", description: selectedDate || "" });
    },
    onError: (err: any) => {
      toast({ title: "Kunne ikke fjerne blokkering", description: err?.message || "Ukjent feil", variant: "destructive" });
    },
  });

  const blockedMap = useMemo(() => {
    const m = new Map<string, string | null>();
    blockedRows.forEach((b) => m.set(b.date, b.reason));
    return m;
  }, [blockedRows]);

  const cells = useMemo(() => {
    const first = new Date(cursor.y, cursor.m - 1, 1);
    const lastDay = new Date(cursor.y, cursor.m, 0).getDate();
    const startOffset = (first.getDay() + 6) % 7;
    const arr: Array<{ key: string; date: string | null; day: number | null }> = [];
    for (let i = 0; i < startOffset; i++) arr.push({ key: `e-${i}`, date: null, day: null });
    for (let d = 1; d <= lastDay; d++) {
      const iso = `${cursor.y}-${pad(cursor.m)}-${pad(d)}`;
      arr.push({ key: iso, date: iso, day: d });
    }
    return arr;
  }, [cursor]);

  const goPrev = () => {
    setCursor((c) => (c.m === 1 ? { y: c.y - 1, m: 12 } : { y: c.y, m: c.m - 1 }));
  };
  const goNext = () => {
    setCursor((c) => (c.m === 12 ? { y: c.y + 1, m: 1 } : { y: c.y, m: c.m + 1 }));
  };

  return (
    <div className="space-y-4 pt-2">
      <div className="flex items-center gap-3">
        <Button
          size="icon"
          variant="ghost"
          onClick={() => navigate("/profil")}
          data-testid="button-back"
        >
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <h1 className="text-xl font-bold" data-testid="heading-admin-tilgjengelighet">Tilgjengelighet</h1>
      </div>

      <Card>
        <CardContent className="p-3">
          <div className="flex items-center justify-between mb-3">
            <Button size="icon" variant="ghost" onClick={goPrev} data-testid="button-prev-month">
              <ChevronLeft className="w-5 h-5" />
            </Button>
            <div className="text-sm font-semibold" data-testid="text-month-label">
              {MONTH_NAMES_NB[cursor.m - 1]} {cursor.y}
            </div>
            <Button size="icon" variant="ghost" onClick={goNext} data-testid="button-next-month">
              <ChevronRight className="w-5 h-5" />
            </Button>
          </div>

          <div className="grid grid-cols-7 gap-1 mb-1">
            {WEEKDAYS.map((d) => (
              <div key={d} className="text-[10px] text-center text-muted-foreground font-medium py-1">
                {d}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1">
            {cells.map((cell) => {
              if (!cell.date) return <div key={cell.key} className="aspect-square" />;
              const iso = cell.date;
              const dt = new Date(cursor.y, cursor.m - 1, cell.day!);
              const wd = dt.getDay();
              const isWeekend = wd === 0 || wd === 6;
              const isBlocked = blockedMap.has(iso);

              let cls = "aspect-square rounded-md flex items-center justify-center text-xs font-medium relative cursor-pointer ";
              if (isBlocked) {
                cls += "bg-muted text-muted-foreground line-through hover-elevate";
              } else if (isWeekend) {
                cls += "bg-muted/40 text-muted-foreground/70 hover-elevate";
              } else {
                cls += "bg-card border border-border text-foreground hover-elevate";
              }

              return (
                <button
                  key={cell.key}
                  type="button"
                  className={cls}
                  onClick={() => {
                    setSelectedDate(iso);
                    setReason(blockedMap.get(iso) || "");
                  }}
                  data-testid={`day-${iso}`}
                  title={isBlocked ? `${iso} – Stengt${blockedMap.get(iso) ? ` (${blockedMap.get(iso)})` : ""}` : iso}
                >
                  {cell.day}
                  {isBlocked && (
                    <span className="absolute top-0.5 right-1 text-[9px]">×</span>
                  )}
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Dialog open={!!selectedDate} onOpenChange={(o) => { if (!o) setSelectedDate(null); }}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto" data-testid="dialog-day-detail">
          <DialogHeader>
            <DialogTitle data-testid="text-dialog-date">
              {selectedDate ? formatNoDate(selectedDate) : ""}
            </DialogTitle>
            <DialogDescription>
              {dayData?.blocked
                ? "Denne dagen er blokkert (stengt) for alle ansatte."
                : "Ansatte som har markert seg som ledig denne dagen."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 mt-2">
            {!dayData && dayLoading ? (
              <div className="flex items-center justify-center py-8 text-muted-foreground">
                <Loader2 className="w-5 h-5 animate-spin mr-2" /> Laster …
              </div>
            ) : dayData?.blocked ? (
              <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm">
                <div className="flex items-center gap-2 font-medium text-destructive">
                  <Lock className="w-4 h-4" /> Stengt
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Ansatte kan ikke sette tilgjengelighet på denne datoen.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3 w-full"
                  onClick={() => selectedDate && unblockMut.mutate(selectedDate)}
                  disabled={unblockMut.isPending}
                  data-testid="button-unblock"
                >
                  {unblockMut.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  ) : (
                    <Unlock className="w-4 h-4 mr-2" />
                  )}
                  Fjern blokkering
                </Button>
              </div>
            ) : (
              <>
                <div className="rounded-md border p-3 space-y-2">
                  <div className="text-xs text-muted-foreground">Blokker dato (helligdag, stengt barnehage osv.)</div>
                  <Input
                    placeholder="Valgfri grunn (f.eks. 1. mai)"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    data-testid="input-block-reason"
                  />
                  <Button
                    size="sm"
                    className="w-full"
                    onClick={() => selectedDate && blockMut.mutate({ date: selectedDate, reason })}
                    disabled={blockMut.isPending}
                    data-testid="button-block"
                  >
                    {blockMut.isPending ? (
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    ) : (
                      <Lock className="w-4 h-4 mr-2" />
                    )}
                    Blokker dato
                  </Button>
                </div>

                <div>
                  <div className="text-xs font-semibold mb-2">
                    Ledige ansatte ({dayData?.employees?.length ?? 0})
                  </div>
                  {dayLoading ? (
                    <div className="text-sm text-muted-foreground">Laster …</div>
                  ) : (dayData?.employees?.length ?? 0) === 0 ? (
                    <div className="text-sm text-muted-foreground" data-testid="text-no-available">
                      Ingen ansatte har markert seg som ledig.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {dayData!.employees.map((e) => {
                        const initials = e.name
                          .split(" ")
                          .map((n) => n[0])
                          .join("")
                          .toUpperCase();
                        return (
                          <div
                            key={e.userId}
                            className={`flex items-center gap-3 p-2 rounded-md border ${
                              e.status === "assigned" ? "border-orange-300 bg-orange-50 dark:bg-orange-950/20" : ""
                            }`}
                            data-testid={`employee-row-${e.userId}`}
                          >
                            <Avatar className="w-8 h-8">
                              {e.profileImage && <AvatarImage src={e.profileImage} alt={e.name} />}
                              <AvatarFallback className="bg-primary text-primary-foreground text-xs font-bold">
                                {initials}
                              </AvatarFallback>
                            </Avatar>
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium truncate">{e.name}</div>
                              <div className="text-xs text-muted-foreground truncate">
                                {e.stilling} · {e.region}
                              </div>
                            </div>
                            {e.status === "assigned" && (
                              <span className="text-[10px] font-medium text-orange-700 dark:text-orange-300 px-2 py-0.5 rounded-full bg-orange-200 dark:bg-orange-900/40">
                                Tildelt vakt
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setSelectedDate(null)} data-testid="button-close">
              Lukk
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function formatNoDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return `${pad(d)}.${pad(m)}.${y}`;
}
