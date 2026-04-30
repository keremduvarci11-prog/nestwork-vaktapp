import { useMemo, useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Separator } from "@/components/ui/separator";
import {
  ArrowLeft,
  Search,
  CheckCircle2,
  AlertTriangle,
  FileText,
  ShieldCheck,
  Download,
  Check,
  X,
  Pencil,
  KeyRound,
  Trash2,
  Wallet,
  Loader2,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

interface OnboardingItem {
  id: string;
  item: string;
  completed: boolean;
  completedAt: string | null;
}

interface EmployeeOnboarding {
  userId: string;
  name: string;
  region: string;
  username?: string;
  email?: string;
  phone?: string;
  stilling?: string;
  timelonn?: string | number | null;
  profileImage: string | null;
  cvFile: string | null;
  politiattestFile: string | null;
  progress: number;
  completedCount: number;
  totalCount: number;
  monthKey?: string;
  godkjentTimerThisMonth?: number;
  godkjentVakterThisMonth?: number;
  bruttoThisMonth?: number;
  items: OnboardingItem[];
}

const MONTH_NAMES_NB_FULL = ["januar", "februar", "mars", "april", "mai", "juni", "juli", "august", "september", "oktober", "november", "desember"];
const MONTH_NAMES_NB_SHORT = ["Januar", "Februar", "Mars", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Desember"];
const WEEKDAYS_SHORT = ["M", "T", "O", "T", "F", "L", "S"];

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

interface UserAvailabilityResponse {
  availability: Array<{ date: string; status: "available" | "unavailable" }>;
  shiftDates: string[];
  blockedDates: string[];
}

function EmployeeAvailabilityCalendar({ userId }: { userId: string }) {
  const [cursor, setCursor] = useState<{ y: number; m: number }>(() => {
    const d = new Date();
    return { y: d.getFullYear(), m: d.getMonth() + 1 };
  });
  const monthKey = `${cursor.y}-${pad2(cursor.m)}`;

  const { data, isLoading } = useQuery<UserAvailabilityResponse>({
    queryKey: ["/api/admin/availability/user", userId, monthKey],
    queryFn: async () => {
      const r = await fetch(`/api/admin/availability/user/${userId}?month=${monthKey}`, { credentials: "include" });
      if (!r.ok) throw new Error("Kunne ikke hente data");
      return r.json();
    },
  });

  const availMap = useMemo(() => {
    const m = new Map<string, "available" | "unavailable">();
    (data?.availability || []).forEach((a) => m.set(a.date, a.status));
    return m;
  }, [data]);
  const shiftSet = useMemo(() => new Set(data?.shiftDates || []), [data]);
  const blockedSet = useMemo(() => new Set(data?.blockedDates || []), [data]);

  const cells = useMemo(() => {
    const first = new Date(cursor.y, cursor.m - 1, 1);
    const lastDay = new Date(cursor.y, cursor.m, 0).getDate();
    const startOffset = (first.getDay() + 6) % 7;
    const arr: Array<{ key: string; date: string | null; day: number | null }> = [];
    for (let i = 0; i < startOffset; i++) arr.push({ key: `e-${i}`, date: null, day: null });
    for (let d = 1; d <= lastDay; d++) {
      const iso = `${cursor.y}-${pad2(cursor.m)}-${pad2(d)}`;
      arr.push({ key: iso, date: iso, day: d });
    }
    return arr;
  }, [cursor]);

  const goPrev = () => setCursor((c) => (c.m === 1 ? { y: c.y - 1, m: 12 } : { y: c.y, m: c.m - 1 }));
  const goNext = () => setCursor((c) => (c.m === 12 ? { y: c.y + 1, m: 1 } : { y: c.y, m: c.m + 1 }));

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Button size="icon" variant="ghost" onClick={goPrev} className="h-7 w-7" data-testid="button-cal-prev">
          <ChevronLeft className="w-4 h-4" />
        </Button>
        <div className="text-xs font-semibold" data-testid="text-cal-month">
          {MONTH_NAMES_NB_SHORT[cursor.m - 1]} {cursor.y}
        </div>
        <Button size="icon" variant="ghost" onClick={goNext} className="h-7 w-7" data-testid="button-cal-next">
          <ChevronRight className="w-4 h-4" />
        </Button>
      </div>

      <div className="grid grid-cols-7 gap-0.5">
        {WEEKDAYS_SHORT.map((d, i) => (
          <div key={i} className="text-[9px] text-center text-muted-foreground py-0.5">
            {d}
          </div>
        ))}
      </div>

      {isLoading ? (
        <Skeleton className="h-32 w-full" />
      ) : (
        <div className="grid grid-cols-7 gap-0.5">
          {cells.map((cell) => {
            if (!cell.date) return <div key={cell.key} className="aspect-square" />;
            const iso = cell.date;
            const dt = new Date(cursor.y, cursor.m - 1, cell.day!);
            const wd = dt.getDay();
            const isWeekend = wd === 0 || wd === 6;
            const isBlocked = blockedSet.has(iso);
            const hasShift = shiftSet.has(iso);
            const status = availMap.get(iso);

            let cls = "aspect-square rounded-sm flex items-center justify-center text-[10px] font-medium relative ";
            if (isBlocked) {
              cls += "bg-muted text-muted-foreground line-through";
            } else if (hasShift) {
              cls += "bg-orange-500 text-white";
            } else if (isWeekend) {
              cls += "bg-muted/40 text-muted-foreground/60";
            } else if (status === "available") {
              cls += "bg-green-600 text-white";
            } else if (status === "unavailable") {
              cls += "bg-red-500 text-white";
            } else {
              cls += "bg-card border border-border text-foreground";
            }
            return (
              <div key={cell.key} className={cls} data-testid={`cal-day-${iso}`} title={iso}>
                {cell.day}
                {isBlocked && !hasShift && (
                  <span className="absolute top-0 right-0.5 text-[8px]">×</span>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-[10px] text-muted-foreground pt-1">
        <div className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-green-600" /> Ledig</div>
        <div className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-red-500" /> Ikke ledig</div>
        <div className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-orange-500" /> Tildelt vakt</div>
        <div className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-muted" /> Stengt</div>
      </div>
    </div>
  );
}

function formatNokAdmin(n: number) {
  return n.toLocaleString("nb-NO", { maximumFractionDigits: 2 });
}

function monthKeyToLabel(key?: string) {
  if (!key) return "";
  const [y, m] = key.split("-").map(Number);
  if (!y || !m) return "";
  return `${MONTH_NAMES_NB_FULL[m - 1]} ${y}`;
}

async function downloadAuthed(url: string, suggestedName: string) {
  try {
    const token = localStorage.getItem("token");
    const headers: Record<string, string> = {};
    if (token) headers["Authorization"] = `Bearer ${token}`;
    const res = await fetch(url, { credentials: "include", headers });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    const ext = url.split(".").pop()?.split("?")[0] || "";
    const filename = ext ? `${suggestedName}.${ext}` : suggestedName;
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = objectUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  } catch (e) {
    console.error("Download failed:", e);
    alert("Kunne ikke laste ned filen. Prøv igjen.");
  }
}

function EmployeeDetailDialog({
  emp,
  open,
  onOpenChange,
}: {
  emp: EmployeeOnboarding | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const { toast } = useToast();
  const [timelonnInput, setTimelonnInput] = useState<string>("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (open && emp) {
      const initial = emp.timelonn != null ? String(emp.timelonn) : "";
      setTimelonnInput(initial);
    }
  }, [open, emp?.userId, emp?.timelonn]);

  const saveTimelonn = useMutation({
    mutationFn: async () => {
      if (!emp) throw new Error("Ingen ansatt valgt");
      const value = timelonnInput.replace(",", ".").trim();
      const num = Number(value);
      if (!isFinite(num) || num < 0) {
        throw new Error("Timelønn må være et positivt tall");
      }
      return apiRequest("PATCH", `/api/users/${emp.userId}`, {
        timelonn: num.toFixed(2),
      });
    },
    onSuccess: () => {
      toast({
        title: "Timelønn lagret",
        description: `Ny timelønn for ${emp?.name} er lagret.`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/onboarding-overview"] });
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
    },
    onError: (err: any) => {
      toast({
        title: "Kunne ikke lagre",
        description: err?.message || "Ukjent feil",
        variant: "destructive",
      });
    },
  });

  const resetPassword = useMutation({
    mutationFn: async () => {
      if (!emp) throw new Error("Ingen ansatt valgt");
      return apiRequest("POST", `/api/users/${emp.userId}/admin-reset-password`, {
        newPassword: "nestwork2026",
      });
    },
    onSuccess: () => {
      toast({
        title: "Passord nullstilt",
        description: "Nytt midlertidig passord: nestwork2026",
      });
    },
    onError: (err: any) => {
      toast({
        title: "Kunne ikke nullstille passord",
        description: err?.message || "Ukjent feil",
        variant: "destructive",
      });
    },
  });

  const deleteUser = useMutation({
    mutationFn: async () => {
      if (!emp) throw new Error("Ingen ansatt valgt");
      return apiRequest("DELETE", `/api/users/${emp.userId}`);
    },
    onSuccess: () => {
      toast({
        title: "Bruker slettet",
        description: `${emp?.name} er fjernet fra systemet.`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/onboarding-overview"] });
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      setConfirmDelete(false);
      onOpenChange(false);
    },
    onError: (err: any) => {
      toast({
        title: "Kunne ikke slette bruker",
        description: err?.message || "Ukjent feil",
        variant: "destructive",
      });
    },
  });

  if (!emp) return null;

  const initials = emp.name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase();

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(o) => {
          if (!o) {
            setTimelonnInput("");
          }
          onOpenChange(o);
        }}
      >
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto" data-testid="dialog-employee-detail">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              <Avatar className="w-10 h-10">
                {emp.profileImage && <AvatarImage src={emp.profileImage} alt={emp.name} />}
                <AvatarFallback className="bg-primary text-primary-foreground text-sm font-bold">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <span data-testid="text-detail-name">{emp.name}</span>
            </DialogTitle>
            <DialogDescription>
              {emp.stilling || "Ansatt"} {emp.region ? `· ${emp.region}` : ""}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5 mt-2">
            {/* Onboarding-status */}
            <section>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Onboarding-status
                </h3>
                <span
                  className={`text-xs font-medium ${
                    emp.progress === 100
                      ? "text-green-600 dark:text-green-400"
                      : "text-muted-foreground"
                  }`}
                  data-testid="text-detail-progress"
                >
                  {emp.completedCount}/{emp.totalCount} · {emp.progress}%
                </span>
              </div>
              <Progress value={emp.progress} className="h-1.5 mb-3" />
              <div className="space-y-1.5">
                {emp.items.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center gap-2 text-sm"
                    data-testid={`detail-item-${item.id}`}
                  >
                    {item.completed ? (
                      <Check className="w-4 h-4 text-green-600 dark:text-green-400 flex-shrink-0" />
                    ) : (
                      <X className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                    )}
                    <span
                      className={
                        item.completed
                          ? "text-muted-foreground line-through"
                          : "font-medium"
                      }
                    >
                      {item.item}
                    </span>
                  </div>
                ))}
              </div>

              <div className="mt-3 space-y-1.5">
                <div className="flex items-center gap-2 text-sm">
                  <FileText className="w-4 h-4 flex-shrink-0" />
                  {emp.cvFile ? (
                    <a
                      href="#"
                      onClick={(e) => {
                        e.preventDefault();
                        downloadAuthed(emp.cvFile!, `CV-${emp.name}`);
                      }}
                      className="flex items-center gap-1.5 text-primary hover:underline"
                      data-testid="link-detail-cv"
                    >
                      <span>Last ned CV</span>
                      <Download className="w-3 h-3" />
                    </a>
                  ) : (
                    <span className="text-muted-foreground">CV ikke lastet opp</span>
                  )}
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <ShieldCheck className="w-4 h-4 flex-shrink-0" />
                  {emp.politiattestFile ? (
                    <a
                      href="#"
                      onClick={(e) => {
                        e.preventDefault();
                        downloadAuthed(emp.politiattestFile!, `Politiattest-${emp.name}`);
                      }}
                      className="flex items-center gap-1.5 text-primary hover:underline"
                      data-testid="link-detail-politiattest"
                    >
                      <span>Last ned politiattest</span>
                      <Download className="w-3 h-3" />
                    </a>
                  ) : (
                    <span className="text-muted-foreground">Politiattest ikke lastet opp</span>
                  )}
                </div>
              </div>
            </section>

            <Separator />

            {/* Tilgjengelighet */}
            <section>
              <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-2">
                Tilgjengelighet
              </h3>
              <EmployeeAvailabilityCalendar userId={emp.userId} />
            </section>

            <Separator />

            {/* Timelønn */}
            <section>
              <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1.5">
                <Wallet className="w-3.5 h-3.5" /> Timelønn
              </h3>
              <Label htmlFor="timelonn-input" className="sr-only">
                Timelønn (kr/t)
              </Label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Input
                    id="timelonn-input"
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    min="0"
                    placeholder="f.eks. 207"
                    value={timelonnInput}
                    onChange={(e) => setTimelonnInput(e.target.value)}
                    className="pr-12"
                    data-testid="input-timelonn"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">
                    kr/t
                  </span>
                </div>
                <Button
                  onClick={() => saveTimelonn.mutate()}
                  disabled={saveTimelonn.isPending}
                  data-testid="button-save-timelonn"
                >
                  {saveTimelonn.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    "Lagre"
                  )}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mt-1.5">
                Brukes på lønn-siden og i fakturasum til barnehagene.
              </p>

              <div className="mt-3 grid grid-cols-2 gap-2">
                <div className="rounded-md border p-2.5 bg-muted/30">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    Brutto i {monthKeyToLabel(emp?.monthKey)}
                  </p>
                  <p className="text-sm font-bold mt-0.5" data-testid="text-detail-brutto">
                    {formatNokAdmin(emp?.bruttoThisMonth ?? 0)} kr
                  </p>
                </div>
                <div className="rounded-md border p-2.5 bg-muted/30">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    Godkjente timer
                  </p>
                  <p className="text-sm font-bold mt-0.5" data-testid="text-detail-godkjent-timer">
                    {(emp?.godkjentTimerThisMonth ?? 0).toFixed(2).replace(".", ",")} t
                  </p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    {emp?.godkjentVakterThisMonth ?? 0} vakt{(emp?.godkjentVakterThisMonth ?? 0) === 1 ? "" : "er"}
                  </p>
                </div>
              </div>
              <p className="text-[10px] text-muted-foreground mt-1.5">
                Estimat oppdateres automatisk hver gang en vakt blir godkjent.
              </p>
            </section>

            <Separator />

            {/* Sikkerhetstiltak */}
            <section>
              <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-2">
                Sikkerhet
              </h3>
              <div className="space-y-2">
                <Button
                  variant="outline"
                  className="w-full justify-start"
                  onClick={() => resetPassword.mutate()}
                  disabled={resetPassword.isPending}
                  data-testid="button-reset-password"
                >
                  {resetPassword.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  ) : (
                    <KeyRound className="w-4 h-4 mr-2" />
                  )}
                  Nullstill passord
                </Button>
                <Button
                  variant="outline"
                  className="w-full justify-start text-destructive hover:text-destructive"
                  onClick={() => setConfirmDelete(true)}
                  disabled={deleteUser.isPending}
                  data-testid="button-delete-user"
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Slett bruker
                </Button>
              </div>
            </section>
          </div>

          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => onOpenChange(false)}
              data-testid="button-close-detail"
            >
              Lukk
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent data-testid="dialog-confirm-delete">
          <AlertDialogHeader>
            <AlertDialogTitle>Slette {emp.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Dette fjerner brukeren permanent. Vakter og historikk knyttet til
              brukeren kan bli berørt. Handlingen kan ikke angres.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Avbryt</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                deleteUser.mutate();
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete"
            >
              {deleteUser.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                "Slett bruker"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export default function AnsattesOnboarding() {
  const [, navigate] = useLocation();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const { data: employees, isLoading } = useQuery<EmployeeOnboarding[]>({
    queryKey: ["/api/admin/onboarding-overview"],
  });

  const filtered = employees?.filter((e) => {
    const q = searchQuery.toLowerCase();
    return (
      e.name.toLowerCase().includes(q) ||
      e.userId.toLowerCase().includes(q)
    );
  });

  const selectedEmp = employees?.find((e) => e.userId === selectedId) || null;

  const openDetail = (userId: string) => {
    setSelectedId(userId);
    setDialogOpen(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button
          size="icon"
          variant="ghost"
          onClick={() => navigate("/profil")}
          data-testid="button-back"
        >
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <h1 className="text-xl font-bold" data-testid="heading-ansatte">Ansatte</h1>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Søk etter ansatt (navn eller ID)"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9"
          data-testid="input-search-employee"
        />
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-20 w-full rounded-md" />
          ))}
        </div>
      ) : filtered && filtered.length > 0 ? (
        <div className="space-y-2">
          {filtered.map((emp) => {
            const initials = emp.name
              .split(" ")
              .map((n) => n[0])
              .join("")
              .toUpperCase();

            return (
              <Card
                key={emp.userId}
                className="hover-elevate cursor-pointer"
                onClick={() => openDetail(emp.userId)}
                data-testid={`card-employee-${emp.userId}`}
              >
                <CardContent className="p-4 flex items-center gap-3">
                  <Avatar className="w-10 h-10 flex-shrink-0">
                    {emp.profileImage && (
                      <AvatarImage src={emp.profileImage} alt={emp.name} />
                    )}
                    <AvatarFallback className="bg-primary text-primary-foreground text-sm font-bold">
                      {initials}
                    </AvatarFallback>
                  </Avatar>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className="text-sm font-medium truncate"
                        data-testid={`text-employee-name-${emp.userId}`}
                      >
                        {emp.name}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {emp.region}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <Progress value={emp.progress} className="h-1.5 flex-1" />
                      <span
                        className={`text-xs font-medium ${
                          emp.progress === 100
                            ? "text-green-600 dark:text-green-400"
                            : "text-muted-foreground"
                        }`}
                        data-testid={`text-progress-${emp.userId}`}
                      >
                        {emp.progress}%
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    {emp.progress === 100 ? (
                      <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400" />
                    ) : (
                      <AlertTriangle className="w-5 h-5 text-amber-500" />
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={(e) => {
                        e.stopPropagation();
                        openDetail(emp.userId);
                      }}
                      data-testid={`button-edit-employee-${emp.userId}`}
                    >
                      <Pencil className="w-3.5 h-3.5 mr-1" />
                      Rediger
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <div className="text-center py-8">
          <p className="text-sm text-muted-foreground" data-testid="text-no-results">
            {searchQuery
              ? "Ingen ansatte funnet for søket"
              : "Ingen ansatte registrert"}
          </p>
        </div>
      )}

      <EmployeeDetailDialog
        emp={selectedEmp}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
      />
    </div>
  );
}
