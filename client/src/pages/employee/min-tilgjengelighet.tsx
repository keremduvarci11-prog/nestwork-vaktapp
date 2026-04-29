import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { ChevronLeft, ChevronRight, Info } from "lucide-react";

interface AvailRow {
  id: string;
  userId: string;
  date: string;
  status: "available" | "unavailable";
}
interface VaktRow {
  id: string;
  ansattId: string | null;
  dato: string;
  status?: string;
}
interface BlockedRow {
  date: string;
  reason: string | null;
}

const toIso = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

const NORWEGIAN_DAYS = ["Man", "Tir", "Ons", "Tor", "Fre", "Lør", "Søn"];

export default function MinTilgjengelighet() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [viewMonth, setViewMonth] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d;
  });

  const month = monthKey(viewMonth);

  const { data: rows, isLoading } = useQuery<AvailRow[]>({
    queryKey: ["/api/availability/me", month],
    queryFn: async () => {
      const res = await fetch(`/api/availability/me?month=${month}`, { credentials: "include" });
      if (!res.ok) throw new Error("Kunne ikke hente tilgjengelighet");
      return res.json();
    },
    enabled: !!user,
  });

  const { data: blocked } = useQuery<BlockedRow[]>({
    queryKey: ["/api/blocked-dates", month],
    queryFn: async () => {
      const res = await fetch(`/api/blocked-dates?month=${month}`, { credentials: "include" });
      if (!res.ok) throw new Error("Kunne ikke hente blokkerte dager");
      return res.json();
    },
  });

  const { data: vakter } = useQuery<VaktRow[]>({
    queryKey: ["/api/vakter/mine", user?.id],
    queryFn: async () => {
      const res = await fetch(`/api/vakter/mine/${user!.id}`, { credentials: "include" });
      if (!res.ok) throw new Error("Kunne ikke hente vakter");
      return res.json();
    },
    enabled: !!user?.id,
  });

  const statusByDate = useMemo(() => {
    const m = new Map<string, "available" | "unavailable">();
    (rows || []).forEach((r) => m.set(r.date, r.status));
    return m;
  }, [rows]);

  const blockedSet = useMemo(() => new Set((blocked || []).map((b) => b.date)), [blocked]);
  const shiftSet = useMemo(
    () => new Set((vakter || []).filter((v) => v.ansattId === user?.id).map((v) => v.dato)),
    [vakter, user?.id],
  );

  const setMutation = useMutation({
    mutationFn: async ({ date, status }: { date: string; status: "available" | "unavailable" }) =>
      apiRequest("PUT", "/api/availability/me", { date, status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/availability/me"] });
    },
    onError: (err: any) => {
      toast({ title: "Kunne ikke lagre", description: err?.message || "", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (date: string) => apiRequest("DELETE", `/api/availability/me/${date}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/availability/me"] });
    },
    onError: (err: any) => {
      toast({ title: "Kunne ikke fjerne", description: err?.message || "", variant: "destructive" });
    },
  });

  const handleDayClick = (date: string) => {
    const current = statusByDate.get(date);
    if (!current) {
      setMutation.mutate({ date, status: "available" });
    } else if (current === "available") {
      setMutation.mutate({ date, status: "unavailable" });
    } else {
      deleteMutation.mutate(date);
    }
  };

  // Build calendar grid: leading blanks for Mon-start week
  const year = viewMonth.getFullYear();
  const monthIdx = viewMonth.getMonth();
  const firstOfMonth = new Date(year, monthIdx, 1);
  const daysInMonth = new Date(year, monthIdx + 1, 0).getDate();
  const startWeekday = (firstOfMonth.getDay() + 6) % 7;

  const cells: (string | null)[] = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push(toIso(new Date(year, monthIdx, d)));
  }
  while (cells.length % 7 !== 0) cells.push(null);

  const todayIso = toIso(new Date());
  const monthLabel = viewMonth.toLocaleDateString("nb-NO", { month: "long", year: "numeric" });

  const navigateMonth = (delta: number) => {
    const next = new Date(viewMonth);
    next.setMonth(next.getMonth() + delta);
    setViewMonth(next);
  };

  return (
    <div className="space-y-5" data-testid="page-min-tilgjengelighet">
      <div>
        <h1 className="text-xl font-bold">Tilgjengelighet</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Trykk på en hverdag for å markere når du er ledig.
        </p>
      </div>

      {/* Forklaring */}
      <Card className="bg-muted/30">
        <CardContent className="p-3">
          <p className="text-xs text-muted-foreground mb-2 flex items-center gap-1.5">
            <Info className="w-3.5 h-3.5" /> Trykk på samme dag for å bytte status:
          </p>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs">
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded bg-green-500" /> Ledig
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded bg-red-500" /> Ikke ledig
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded bg-orange-500" /> Tildelt vakt
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded bg-zinc-300 dark:bg-zinc-600" /> Stengt / fortid
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Måned-navigering */}
      <Card>
        <CardContent className="p-3">
          <div className="flex items-center justify-between mb-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigateMonth(-1)}
              data-testid="button-prev-month"
              aria-label="Forrige måned"
            >
              <ChevronLeft className="w-5 h-5" />
            </Button>
            <span className="font-semibold capitalize" data-testid="text-current-month">
              {monthLabel}
            </span>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigateMonth(1)}
              data-testid="button-next-month"
              aria-label="Neste måned"
            >
              <ChevronRight className="w-5 h-5" />
            </Button>
          </div>

          {/* Ukedager */}
          <div className="grid grid-cols-7 gap-1 mb-1">
            {NORWEGIAN_DAYS.map((d) => (
              <div key={d} className="text-center text-[10px] font-medium text-muted-foreground py-1">
                {d}
              </div>
            ))}
          </div>

          {/* Dager */}
          {isLoading ? (
            <Skeleton className="h-64 w-full rounded-md" />
          ) : (
            <div className="grid grid-cols-7 gap-1">
              {cells.map((date, idx) => {
                if (!date) {
                  return <div key={`b-${idx}`} className="aspect-square" />;
                }
                const dayNum = Number(date.split("-")[2]);
                const status = statusByDate.get(date);
                const isToday = date === todayIso;
                const isPast = date < todayIso;
                const [yy, mm, dd] = date.split("-").map(Number);
                const wd = new Date(Date.UTC(yy, mm - 1, dd)).getUTCDay();
                const isWeekend = wd === 0 || wd === 6;
                const isBlocked = blockedSet.has(date);
                const hasShift = shiftSet.has(date);

                const disabled = isPast || isWeekend || isBlocked || hasShift;

                let bg = "bg-muted hover:bg-muted/80 text-foreground";
                let label: React.ReactNode = dayNum;
                let title: string | undefined;

                if (isBlocked) {
                  bg = "bg-zinc-300 dark:bg-zinc-700 text-zinc-500 line-through";
                  title = "Stengt";
                } else if (hasShift) {
                  bg = "bg-orange-500 text-white";
                  title = "Tildelt vakt";
                } else if (status === "available") {
                  bg = "bg-green-500 hover:bg-green-600 text-white";
                } else if (status === "unavailable") {
                  bg = "bg-red-500 hover:bg-red-600 text-white";
                } else if (isPast || isWeekend) {
                  bg = "bg-muted/40 text-muted-foreground";
                  title = isPast ? "Fortid" : "Helg";
                }

                return (
                  <button
                    key={date}
                    onClick={() => !disabled && handleDayClick(date)}
                    disabled={disabled || setMutation.isPending || deleteMutation.isPending}
                    data-testid={`day-${date}`}
                    title={title}
                    className={`aspect-square rounded-md text-sm font-medium transition-colors ${bg} ${
                      isToday ? "ring-2 ring-primary ring-offset-1" : ""
                    } ${disabled ? "cursor-not-allowed" : ""} disabled:opacity-100`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
