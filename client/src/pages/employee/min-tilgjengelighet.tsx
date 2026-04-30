import { useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";

const MONTH_NAMES_NB = [
  "Januar", "Februar", "Mars", "April", "Mai", "Juni",
  "Juli", "August", "September", "Oktober", "November", "Desember",
];
const WEEKDAYS = ["Man", "Tir", "Ons", "Tor", "Fre", "Lør", "Søn"];

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

interface AvailRow {
  date: string;
  status: "available" | "unavailable";
}
interface BlockedRow {
  date: string;
  reason: string | null;
}
interface VaktRow {
  id: string;
  dato: string;
  ansattId: string | null;
}

export default function MinTilgjengelighet() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [cursor, setCursor] = useState<{ y: number; m: number }>(() => {
    const d = new Date();
    return { y: d.getFullYear(), m: d.getMonth() + 1 };
  });
  const monthKey = `${cursor.y}-${pad(cursor.m)}`;

  const { data: avail = [] } = useQuery<AvailRow[]>({
    queryKey: ["/api/availability/me", monthKey],
    queryFn: async () => {
      const r = await fetch(`/api/availability/me?month=${monthKey}`, { credentials: "include" });
      if (!r.ok) throw new Error("Kunne ikke hente tilgjengelighet");
      return r.json();
    },
  });

  const { data: blockedRows = [] } = useQuery<BlockedRow[]>({
    queryKey: ["/api/blocked-dates", monthKey],
    queryFn: async () => {
      const r = await fetch(`/api/blocked-dates?month=${monthKey}`, { credentials: "include" });
      if (!r.ok) throw new Error("Kunne ikke hente blokkerte dager");
      return r.json();
    },
  });

  const { data: mineVakter = [] } = useQuery<VaktRow[]>({
    queryKey: ["/api/vakter/mine", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const r = await fetch(`/api/vakter/mine/${user.id}`, { credentials: "include" });
      if (!r.ok) throw new Error("Kunne ikke hente vakter");
      return r.json();
    },
    enabled: !!user?.id,
  });

  const setStatus = useMutation({
    mutationFn: async ({ date, status }: { date: string; status: "available" | "unavailable" }) =>
      apiRequest("PUT", "/api/availability/me", { date, status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/availability/me", monthKey] });
    },
    onError: (err: any) => {
      toast({
        title: "Kunne ikke lagre",
        description: err?.message || "Ukjent feil",
        variant: "destructive",
      });
    },
  });

  const clearStatus = useMutation({
    mutationFn: async (date: string) =>
      apiRequest("DELETE", `/api/availability/me/${date}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/availability/me", monthKey] });
    },
    onError: (err: any) => {
      toast({
        title: "Kunne ikke nullstille",
        description: err?.message || "Ukjent feil",
        variant: "destructive",
      });
    },
  });

  const availMap = useMemo(() => {
    const m = new Map<string, "available" | "unavailable">();
    avail.forEach((a) => m.set(a.date, a.status));
    return m;
  }, [avail]);

  const blockedMap = useMemo(() => {
    const m = new Map<string, string | null>();
    blockedRows.forEach((b) => m.set(b.date, b.reason));
    return m;
  }, [blockedRows]);

  const shiftSet = useMemo(() => {
    const s = new Set<string>();
    mineVakter.forEach((v) => s.add(v.dato));
    return s;
  }, [mineVakter]);

  const today = todayIso();

  const cells = useMemo(() => {
    const first = new Date(cursor.y, cursor.m - 1, 1);
    const lastDay = new Date(cursor.y, cursor.m, 0).getDate();
    // Mandag-først: getDay() = 0 (søn) ... 6 (lør). Ønsker mandag=0.
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

  const handleClick = (iso: string, isPast: boolean, isWeekend: boolean, isBlocked: boolean, hasShift: boolean) => {
    if (isBlocked || isPast || isWeekend || hasShift) return;
    const cur = availMap.get(iso);
    if (!cur) {
      setStatus.mutate({ date: iso, status: "available" });
    } else if (cur === "available") {
      setStatus.mutate({ date: iso, status: "unavailable" });
    } else {
      clearStatus.mutate(iso);
    }
  };

  return (
    <div className="space-y-4 pt-2">
      <div>
        <h1 className="text-xl font-bold" data-testid="heading-tilgjengelighet">Min tilgjengelighet</h1>
        <p className="text-xs text-muted-foreground mt-1">
          Trykk en dag for å markere deg som ledig. Trykk igjen for å markere ikke-ledig, og en tredje gang for å nullstille.
        </p>
      </div>

      <Card>
        <CardContent className="p-3">
          <div className="flex items-center justify-between mb-3">
            <Button
              size="icon"
              variant="ghost"
              onClick={goPrev}
              data-testid="button-prev-month"
            >
              <ChevronLeft className="w-5 h-5" />
            </Button>
            <div className="text-sm font-semibold" data-testid="text-month-label">
              {MONTH_NAMES_NB[cursor.m - 1]} {cursor.y}
            </div>
            <Button
              size="icon"
              variant="ghost"
              onClick={goNext}
              data-testid="button-next-month"
            >
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
              if (!cell.date) {
                return <div key={cell.key} className="aspect-square" />;
              }
              const iso = cell.date;
              const dt = new Date(cursor.y, cursor.m - 1, cell.day!);
              const wd = dt.getDay(); // 0=søn, 6=lør
              const isWeekend = wd === 0 || wd === 6;
              const isPast = iso < today;
              const isBlocked = blockedMap.has(iso);
              const hasShift = shiftSet.has(iso);
              const status = availMap.get(iso);

              let cls = "aspect-square rounded-md flex items-center justify-center text-xs font-medium relative ";
              let testid = `day-${iso}`;
              let title = iso;

              if (isBlocked) {
                cls += "bg-muted text-muted-foreground cursor-not-allowed line-through";
                title = `${iso} – Stengt${blockedMap.get(iso) ? ` (${blockedMap.get(iso)})` : ""}`;
              } else if (hasShift) {
                cls += "bg-orange-500 text-white cursor-not-allowed";
                title = `${iso} – Tildelt vakt`;
              } else if (isPast || isWeekend) {
                cls += "bg-muted/40 text-muted-foreground/60 cursor-not-allowed";
              } else if (status === "available") {
                cls += "bg-green-600 text-white hover-elevate active-elevate-2 cursor-pointer";
              } else if (status === "unavailable") {
                cls += "bg-red-500 text-white hover-elevate active-elevate-2 cursor-pointer";
              } else {
                cls += "bg-card border border-border text-foreground hover-elevate active-elevate-2 cursor-pointer";
              }

              const disabled = isPast || isWeekend || isBlocked || hasShift;

              return (
                <button
                  key={cell.key}
                  type="button"
                  className={cls}
                  title={title}
                  disabled={disabled}
                  onClick={() => handleClick(iso, isPast, isWeekend, isBlocked, hasShift)}
                  data-testid={testid}
                >
                  {cell.day}
                  {isBlocked && !hasShift && (
                    <span className="absolute top-0.5 right-1 text-[9px]">×</span>
                  )}
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-3 space-y-2">
          <div className="text-xs font-semibold mb-1">Forklaring</div>
          <LegendItem color="bg-green-600" label="Ledig" />
          <LegendItem color="bg-red-500" label="Ikke ledig" />
          <LegendItem color="bg-card border border-border" textBlack label="Ikke valgt" />
          <LegendItem color="bg-orange-500" label="Tildelt vakt (kan ikke endres)" />
          <LegendItem color="bg-muted" textBlack label="Stengt / blokkert av admin" />
          <LegendItem color="bg-muted/40" textBlack label="Helg eller fortidsdag" />
        </CardContent>
      </Card>
    </div>
  );
}

function LegendItem({ color, label, textBlack }: { color: string; label: string; textBlack?: boolean }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className={`w-4 h-4 rounded-sm ${color} ${textBlack ? "" : ""}`} />
      <span className="text-muted-foreground">{label}</span>
    </div>
  );
}
