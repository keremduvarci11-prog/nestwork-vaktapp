import { useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  Clock,
  TrendingUp,
  CheckCircle,
  Send,
  FileDown,
  Hourglass,
  CheckCircle2,
  Download,
  Eye,
} from "lucide-react";
import type { Vakt, Barnehage } from "@shared/schema";

interface LonnsslippMeta {
  id: string;
  userId: string;
  maned: string;
  filNavn: string;
  opplastetAt: string | null;
  opplastetAv: string | null;
}

const MONTH_NAMES = [
  "Januar",
  "Februar",
  "Mars",
  "April",
  "Mai",
  "Juni",
  "Juli",
  "August",
  "September",
  "Oktober",
  "November",
  "Desember",
];

function calcHours(start: string, end: string, trekkPause?: boolean | null) {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  let hours = (eh * 60 + em - sh * 60 - sm) / 60;
  if (trekkPause) hours -= 0.5;
  return Math.max(0, hours);
}

function formatNok(amount: number) {
  return amount.toLocaleString("nb-NO", { maximumFractionDigits: 2 });
}

export default function LonnTimer() {
  const { user } = useAuth();
  const { toast } = useToast();
  const today = new Date();
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
  const [selectedMonth, setSelectedMonth] = useState<string>(todayKey);

  const { data: vakter, isLoading } = useQuery<Vakt[]>({
    queryKey: ["/api/vakter/mine", user?.id],
  });

  const { data: barnehager } = useQuery<Barnehage[]>({
    queryKey: ["/api/barnehager"],
  });

  const { data: lonnsslipper } = useQuery<LonnsslippMeta[]>({
    queryKey: ["/api/users", user?.id, "lonnsslipper"],
    enabled: !!user?.id,
  });

  const barnehageMap = useMemo(() => {
    const m = new Map<string, string>();
    (barnehager || []).forEach((b) => m.set(b.id, b.name));
    return m;
  }, [barnehager]);

  const timelonn = parseFloat(user?.timelonn || "0");

  const availableMonths = useMemo(() => {
    const set = new Set<string>();
    set.add(todayKey);
    (vakter || []).forEach((v) => {
      if (!v.dato) return;
      if (v.status !== "godkjent") return;
      const d = new Date(v.dato + "T00:00:00");
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      set.add(key);
    });
    (lonnsslipper || []).forEach((l) => {
      if (l.maned) set.add(l.maned);
    });
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  }, [vakter, lonnsslipper, todayKey]);

  const monthVakter = useMemo(() => {
    if (!vakter) return [];
    const [y, m] = selectedMonth.split("-").map(Number);
    return vakter
      .filter((v) => {
        if (!v.dato) return false;
        if (v.status !== "godkjent") return false;
        const d = new Date(v.dato + "T00:00:00");
        return d.getFullYear() === y && d.getMonth() === m - 1;
      })
      .sort((a, b) => a.dato.localeCompare(b.dato));
  }, [vakter, selectedMonth]);

  const totals = useMemo(() => {
    const totalHours = monthVakter.reduce(
      (sum, v) => sum + calcHours(v.startTid, v.sluttTid, v.trekkPause),
      0,
    );
    const grossPay = totalHours * timelonn;
    const feriepenger = grossPay * 0.12;
    return { totalHours, grossPay, feriepenger, totalWithFeriepenger: grossPay + feriepenger };
  }, [monthVakter, timelonn]);

  const submitTimer = useMutation({
    mutationFn: async (vaktId: string) =>
      apiRequest("POST", `/api/vakter/${vaktId}/innsend-timer`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/vakter/mine", user?.id] });
      toast({ title: "Timer sendt inn", description: "Admin vil nå godkjenne timene dine." });
    },
    onError: (err: Error) => {
      toast({
        title: "Kunne ikke sende inn",
        description: err?.message || "Noe gikk galt",
        variant: "destructive",
      });
    },
  });

  const isCurrentMonth = selectedMonth === todayKey;
  const monthLabel = (() => {
    const [y, m] = selectedMonth.split("-").map(Number);
    return `${MONTH_NAMES[m - 1]} ${y}`;
  })();

  const lonnsslippForMonth = (lonnsslipper || []).find((l) => l.maned === selectedMonth);

  const fetchLonnsslippBlob = async () => {
    if (!user?.id || !lonnsslippForMonth) return null;
    const res = await fetch(
      `/api/users/${user.id}/lonnsslipper/${lonnsslippForMonth.maned}/file`,
      { credentials: "include" },
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    let filename = lonnsslippForMonth.filNavn || `lonnsslipp-${selectedMonth}.pdf`;
    const cd = res.headers.get("Content-Disposition") || "";
    const cdMatch = cd.match(/filename="?([^";]+)"?/i);
    if (cdMatch) filename = cdMatch[1];
    return { blob, filename };
  };

  const openLonnsslipp = () => {
    if (!user?.id || !lonnsslippForMonth) return;
    const url = `/api/users/${user.id}/lonnsslipper/${lonnsslippForMonth.maned}/file?inline=1`;
    const win = window.open(url, "_blank", "noopener,noreferrer");
    if (!win) {
      window.location.href = url;
    }
  };

  const downloadLonnsslipp = () => {
    if (!user?.id || !lonnsslippForMonth) return;
    const url = `/api/users/${user.id}/lonnsslipper/${lonnsslippForMonth.maned}/file`;
    const a = document.createElement("a");
    a.href = url;
    a.download = lonnsslippForMonth.filNavn || `lonnsslipp-${selectedMonth}.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const downloadPdf = async () => {
    const { jsPDF } = await import("jspdf");
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 40;
    let y = margin;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.text("Nestwork Group AS", margin, y);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    y += 14;
    doc.text("Org.nr: 936 293 239", margin, y);
    y += 22;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.text(`Lonnsslipp - ${monthLabel}`, margin, y);
    y += 20;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text(`Ansatt: ${user?.name || ""}`, margin, y);
    y += 14;
    if (user?.externalId) {
      doc.text(`Ansatt-ID: ${user.externalId}`, margin, y);
      y += 14;
    }
    doc.text(`Stilling: ${user?.stilling || ""}`, margin, y);
    y += 14;
    doc.text(`Region: ${user?.region || ""}`, margin, y);
    y += 14;
    doc.text(`Timelonn: ${formatNok(timelonn)} kr`, margin, y);
    y += 22;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text("Vakter", margin, y);
    y += 14;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text("Dato", margin, y);
    doc.text("Barnehage", margin + 70, y);
    doc.text("Tid", margin + 220, y);
    doc.text("Timer", margin + 300, y);
    doc.text("Belop", margin + 360, y);
    y += 6;
    doc.setLineWidth(0.5);
    doc.line(margin, y, pageWidth - margin, y);
    y += 12;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    monthVakter.forEach((v) => {
      if (y > 750) {
        doc.addPage();
        y = margin;
      }
      const hours = calcHours(v.startTid, v.sluttTid, v.trekkPause);
      const amount = hours * timelonn;
      const d = new Date(v.dato + "T00:00:00");
      const dateStr = d.toLocaleDateString("nb-NO", { day: "2-digit", month: "2-digit", year: "numeric" });
      const bhName = barnehageMap.get(v.barnehageId) || "";
      const bhTrim = bhName.length > 24 ? bhName.slice(0, 22) + ".." : bhName;
      doc.text(dateStr, margin, y);
      doc.text(bhTrim, margin + 70, y);
      doc.text(`${v.startTid?.slice(0, 5)}-${v.sluttTid?.slice(0, 5)}${v.trekkPause ? "*" : ""}`, margin + 220, y);
      doc.text(hours.toFixed(2), margin + 300, y);
      doc.text(`${formatNok(amount)} kr`, margin + 360, y);
      y += 14;
    });
    if (monthVakter.some((v) => v.trekkPause)) {
      y += 4;
      doc.setFont("helvetica", "italic");
      doc.setFontSize(8);
      doc.text("* 30 min ubetalt pause trukket", margin, y);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
    }

    y += 10;
    doc.setLineWidth(0.5);
    doc.line(margin, y, pageWidth - margin, y);
    y += 18;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text(`Sum timer: ${totals.totalHours.toFixed(2)}`, margin, y);
    y += 14;
    doc.text(`Brutto lonn: ${formatNok(totals.grossPay)} kr`, margin, y);
    y += 14;
    doc.text(`Feriepenger (12%): ${formatNok(totals.feriepenger)} kr`, margin, y);
    y += 18;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text(`Totalt utbetalt: ${formatNok(totals.totalWithFeriepenger)} kr`, margin, y);
    y += 30;

    doc.setFont("helvetica", "italic");
    doc.setFontSize(8);
    doc.text("Generert av Nestwork Vaktapp", margin, y);

    doc.save(`lonnsslipp_${selectedMonth}_${(user?.name || "ansatt").replace(/\s+/g, "_")}.pdf`);
  };

  const canSubmit = (v: Vakt) => {
    if (v.status !== "godkjent") return false;
    if (v.timerInnsendt) return false;
    const end = new Date(`${v.dato}T${v.sluttTid}`);
    return new Date() >= end;
  };

  const todayFormatted = today.toLocaleDateString("nb-NO", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">Lønn & Timer</h1>
        <p className="text-sm text-muted-foreground mt-1" data-testid="text-today-date">
          {todayFormatted}
        </p>
      </div>

      <div className="flex items-center gap-2">
        <Select value={selectedMonth} onValueChange={setSelectedMonth}>
          <SelectTrigger className="flex-1" data-testid="select-month">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {availableMonths.map((key) => {
              const [y, m] = key.split("-").map(Number);
              return (
                <SelectItem key={key} value={key} data-testid={`option-month-${key}`}>
                  {MONTH_NAMES[m - 1]} {y}
                  {key === todayKey ? " (denne måneden)" : ""}
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
        <Button
          variant="outline"
          size="icon"
          onClick={downloadLonnsslipp}
          disabled={!lonnsslippForMonth}
          data-testid="button-download-lonnsslipp-icon"
          title={lonnsslippForMonth ? "Last ned lønnsslipp" : "Ingen lønnsslipp for denne måneden"}
        >
          <Download className="w-4 h-4" />
        </Button>
      </div>

      {lonnsslippForMonth && (
        <Card className="border-green-500/40 bg-green-500/5">
          <CardContent className="p-3 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-green-700 dark:text-green-400">
                Lønnsslipp klar
              </p>
              <p className="text-xs text-muted-foreground truncate" data-testid="text-lonnsslipp-filnavn">
                {lonnsslippForMonth.filNavn}
              </p>
            </div>
            <Button
              size="sm"
              onClick={openLonnsslipp}
              data-testid="button-open-lonnsslipp"
            >
              <Eye className="w-3.5 h-3.5 mr-1.5" />
              Åpne lønnsslipp
            </Button>
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 w-full rounded-md" />
          ))}
        </div>
      ) : (
        <>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <span className="text-sm font-bold text-primary">NOK</span>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Brutto lønn {monthLabel}</p>
                  <p className="text-2xl font-bold" data-testid="text-total-earnings">
                    {formatNok(totals.grossPay)} kr
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
                    <p className="text-xs text-muted-foreground">Timer jobbet</p>
                    <p className="text-lg font-bold" data-testid="text-total-hours">
                      {totals.totalHours.toFixed(1)}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-muted-foreground" />
                  <div>
                    <p className="text-xs text-muted-foreground">Timelønn</p>
                    <p className="text-lg font-bold">{formatNok(timelonn)} kr</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {monthVakter.length > 0 ? (
            <div>
              <h2 className="text-sm font-semibold mb-3">Vakter denne måneden</h2>
              <div className="space-y-2">
                {monthVakter.map((v) => {
                  const hours = calcHours(v.startTid, v.sluttTid, v.trekkPause);
                  const date = new Date(v.dato + "T00:00:00");
                  const submittable = canSubmit(v);
                  const isPending = submitTimer.isPending && submitTimer.variables === v.id;
                  const bhName = barnehageMap.get(v.barnehageId) || "";
                  return (
                    <Card key={v.id} data-testid={`card-vakt-${v.id}`}>
                      <CardContent className="p-3">
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2 min-w-0">
                            <CheckCircle className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />
                            <div className="min-w-0">
                              <p className="text-sm font-medium">
                                {date.toLocaleDateString("nb-NO", {
                                  weekday: "short",
                                  day: "numeric",
                                  month: "short",
                                })}
                              </p>
                              {bhName && (
                                <p className="text-xs font-medium text-foreground/80 truncate" data-testid={`text-barnehage-${v.id}`}>
                                  {bhName}
                                </p>
                              )}
                              <p className="text-xs text-muted-foreground">
                                {v.startTid?.slice(0, 5)} - {v.sluttTid?.slice(0, 5)}
                                {v.trekkPause ? " (30m pause)" : ""}
                              </p>
                            </div>
                          </div>
                          <div className="text-right flex-shrink-0">
                            <p className="text-sm font-medium">
                              {formatNok(hours * timelonn)} kr
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {hours.toFixed(1)} timer
                            </p>
                          </div>
                        </div>

                        <div className="mt-2 pt-2 border-t">
                          {v.timerGodkjent ? (
                            <div
                              className="flex items-center gap-1.5 text-xs text-green-600 dark:text-green-400"
                              data-testid={`status-godkjent-timer-${v.id}`}
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>Timer godkjent av admin</span>
                            </div>
                          ) : v.timerInnsendt ? (
                            <div
                              className="flex items-center gap-1.5 text-xs text-green-600 dark:text-green-400"
                              data-testid={`status-innsendt-${v.id}`}
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>Timer innsendt – venter på godkjenning</span>
                            </div>
                          ) : submittable ? (
                            <Button
                              size="sm"
                              className="w-full h-8"
                              onClick={() => submitTimer.mutate(v.id)}
                              disabled={isPending}
                              data-testid={`button-innsend-${v.id}`}
                            >
                              <Send className="w-3.5 h-3.5 mr-1.5" />
                              {isPending ? "Sender..." : "Send inn timer for godkjenning"}
                            </Button>
                          ) : (
                            <div
                              className="flex items-center gap-1.5 text-xs text-muted-foreground"
                              data-testid={`status-venter-${v.id}`}
                            >
                              <Hourglass className="w-3.5 h-3.5" />
                              <span>Kan sendes inn etter vakten er ferdig</span>
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          ) : (
            <Card>
              <CardContent className="p-6 text-center">
                <p className="text-sm text-muted-foreground">
                  Ingen godkjente vakter i {monthLabel}
                </p>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
