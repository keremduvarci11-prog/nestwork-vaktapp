import { useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { availabilityMonthQueryKey, canEditAvailability, nextAvailabilityStatus, saveAvailability } from "@/lib/availability";
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
type PendingAvailability = {
  desired: "available" | "unavailable" | undefined;
};

export default function MinTilgjengelighet() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [cursor, setCursor] = useState<{ y: number; m: number }>(() => {
    const d = new Date();
    return { y: d.getFullYear(), m: d.getMonth() + 1 };
  });
  const monthKey = `${cursor.y}-${pad(cursor.m)}`;

  const availabilityQuery = useQuery<AvailRow[]>({
    queryKey: ["/api/availability/me", monthKey],
    queryFn: async () => {
      const r = await apiRequest("GET", `/api/availability/me?month=${monthKey}`);
      return r.json();
    },
  });

  const blockedQuery = useQuery<BlockedRow[]>({
    queryKey: ["/api/blocked-dates", monthKey],
    queryFn: async () => {
      const r = await apiRequest("GET", `/api/blocked-dates?month=${monthKey}`);
      return r.json();
    },
  });

  const shiftsQuery = useQuery<VaktRow[]>({
    queryKey: ["/api/vakter/mine", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const r = await apiRequest("GET", `/api/vakter/mine/${user.id}`);
      return r.json();
    },
    enabled: !!user?.id,
  });

  const avail = availabilityQuery.data ?? [];
  const blockedRows = blockedQuery.data ?? [];
  const mineVakter = shiftsQuery.data ?? [];
  const reads = [availabilityQuery, blockedQuery, shiftsQuery];
  const readError = reads.find((q) => q.isError)?.error;
  // Background refetches must not make the already-rendered calendar disappear.
  // A calendar with an error remains visible, but editing stays disabled until
  // the reads are healthy again.
  const calendarReady = !!user?.id && reads.every((q) => q.isSuccess || q.data !== undefined);
  const ready = calendarReady && !readError;
  const [optimisticStatuses, setOptimisticStatuses] = useState<
    Record<string, "available" | "unavailable" | null>
  >({});
  const pendingWrites = useRef(new Map<string, PendingAvailability>());
  const [pendingCount, setPendingCount] = useState(0);

  const availMap = useMemo(() => {
    const m = new Map<string, "available" | "unavailable">();
    avail.forEach((a) => m.set(a.date, a.status));
    return m;
  }, [avail]);

  const displayedAvailMap = useMemo(() => {
    const m = new Map(availMap);
    for (const [date, status] of Object.entries(optimisticStatuses)) {
      if (status === null) m.delete(date);
      else m.set(date, status);
    }
    return m;
  }, [availMap, optimisticStatuses]);

  const updateAvailabilityCache = (date: string, status: "available" | "unavailable" | undefined) => {
    queryClient.setQueryData<AvailRow[]>(availabilityMonthQueryKey(date), (rows = []) => {
      const next = rows.filter((row) => row.date !== date);
      if (status) next.push({ date, status });
      return next.sort((a, b) => a.date.localeCompare(b.date));
    });
  };

  const queueAvailability = (date: string, desired: "available" | "unavailable" | undefined) => {
    setOptimisticStatuses((current) => ({ ...current, [date]: desired ?? null }));
    const existing = pendingWrites.current.get(date);
    if (existing) {
      // The current request finishes first; the newest click is then sent
      // immediately after it. This preserves rapid same-day taps too.
      existing.desired = desired;
      return;
    }

    const pending: PendingAvailability = { desired };
    pendingWrites.current.set(date, pending);
    setPendingCount((count) => count + 1);

    void (async () => {
      try {
        while (true) {
          const requested = pending.desired;
          try {
            await saveAvailability({ date, status: requested });
            updateAvailabilityCache(date, requested);
          } catch (err: any) {
            if (pending.desired === requested) {
              setOptimisticStatuses((current) => {
                const next = { ...current };
                delete next[date];
                return next;
              });
              toast({
                title: "Kunne ikke lagre",
                description: err?.message || "Ukjent feil",
                variant: "destructive",
              });
              break;
            }
            // A newer click superseded this failed request. Try that newest
            // intent instead of rolling the visible calendar back.
            continue;
          }

          if (pending.desired !== requested) continue;
          setOptimisticStatuses((current) => {
            const next = { ...current };
            delete next[date];
            return next;
          });
          break;
        }
      } finally {
        if (pendingWrites.current.get(date) === pending) {
          pendingWrites.current.delete(date);
          setPendingCount((count) => Math.max(0, count - 1));
        }
      }
    })();
  };

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
    if (!canEditAvailability({ ready, busy: false, isPast, isWeekend, isBlocked, hasShift })) return;
    queueAvailability(iso, nextAvailabilityStatus(displayedAvailMap.get(iso)));
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

          {readError ? (
            <div role="alert" className="space-y-2 text-sm">
              <p>Kunne ikke hente kalenderen: {readError.message}</p>
              <Button variant="outline" onClick={() => { void Promise.all(reads.map((q) => q.refetch())); }}>
                Prøv igjen
              </Button>
            </div>
          ) : !calendarReady ? (
            <p role="status" className="text-sm text-muted-foreground">Laster tilgjengelighet, blokkerte dager og vakter…</p>
          ) : null}
          {pendingCount > 0 && <p role="status" className="text-sm text-muted-foreground min-h-5">Lagrer…</p>}
          {calendarReady && <>
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
               const status = displayedAvailMap.get(iso);

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

               const disabled = !canEditAvailability({ ready, busy: false, isPast, isWeekend, isBlocked, hasShift });

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
          </>}
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
