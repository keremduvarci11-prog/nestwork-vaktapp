import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { CalendarClock, CheckCircle2, ChevronDown, Clock3, Eye, Search, Send, XCircle } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { ScheduledMelding, User } from "@shared/schema";

export const SCHEDULED_MESSAGING_TIMEZONE = "Europe/Oslo";
export const APPROVED_WELCOME_MESSAGE =
  "Hei Synne! Vi ønsker deg masse lykke til på din første vakt i Løvstakken barnehage i dag 😊\n\n" +
  "Gi barnehagen et like godt inntrykk som vi har fått av deg 🥰 Vi har stor tro på at du kommer til å gjøre det kjempebra! Vær deg selv, vis initiativ og spør gjerne hvis det er noe du lurer på.\n\n" +
  "Dette kan også være en fin mulighet for fast ansettelse der etter hvert 👍\n\n" +
  "Vi tar gjerne en prat etter vakten for å høre hvordan dagen har vært. Vi heier på deg – lykke til! 😊";

const APPROVED_WELCOME_DUE = "2026-09-11T07:30";

type OsloLocalDateTimeResult = {
  iso: string | null;
  error: "invalid" | "nonexistent" | "ambiguous" | null;
};

const OSLO_DATE_TIME_FORMATTER = new Intl.DateTimeFormat("en-GB", {
  timeZone: SCHEDULED_MESSAGING_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
  hourCycle: "h23",
});

function osloOffsetAt(utcMs: number): number {
  const parts = OSLO_DATE_TIME_FORMATTER.formatToParts(new Date(utcMs));
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value || 0);
  return utcMsFromLocalParts(get("year"), get("month"), get("day"), get("hour"), get("minute")) - utcMs;
}

function osloDateTimeParts(utcMs: number): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
} {
  const parts = OSLO_DATE_TIME_FORMATTER.formatToParts(new Date(utcMs));
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value || 0);
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
  };
}

function utcMsFromLocalParts(year: number, month: number, day: number, hour: number, minute: number): number {
  // Date.UTC treats years 0–99 as 1900–1999. setUTCFullYear avoids that
  // legacy behavior while still giving us a convenient calendar validator.
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  date.setUTCHours(hour, minute, 0, 0);
  return date.getTime();
}

function resolveOsloLocalDateTime(value: string): OsloLocalDateTimeResult {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) return { iso: null, error: "invalid" };

  const [, yearText, monthText, dayText, hourText, minuteText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  if (month < 1 || month > 12 || hour > 23 || minute > 59) {
    return { iso: null, error: "invalid" };
  }

  const localAsUtc = utcMsFromLocalParts(year, month, day, hour, minute);
  const normalized = new Date(localAsUtc);
  if (
    Number.isNaN(localAsUtc) ||
    normalized.getUTCFullYear() !== year ||
    normalized.getUTCMonth() !== month - 1 ||
    normalized.getUTCDate() !== day ||
    normalized.getUTCHours() !== hour ||
    normalized.getUTCMinutes() !== minute
  ) {
    return { iso: null, error: "invalid" };
  }

  // A local wall-clock value can have no matching instant during the spring
  // transition, or two matching instants during the autumn transition.
  // Gather every offset in the surrounding window instead of allowing Date
  // or Intl to silently choose one of those cases.
  const offsets = new Set<number>();
  const scanStepMs = 15 * 60 * 1000;
  for (let utcMs = localAsUtc - 48 * 60 * 60 * 1000; utcMs <= localAsUtc + 48 * 60 * 60 * 1000; utcMs += scanStepMs) {
    offsets.add(osloOffsetAt(utcMs));
  }

  const matchingInstants = Array.from(offsets)
    .map((offset) => localAsUtc - offset)
    .filter((utcMs) => {
      const parts = osloDateTimeParts(utcMs);
      return (
        parts.year === year &&
        parts.month === month &&
        parts.day === day &&
        parts.hour === hour &&
        parts.minute === minute
      );
    });

  if (matchingInstants.length === 0) return { iso: null, error: "nonexistent" };
  if (matchingInstants.length > 1) return { iso: null, error: "ambiguous" };

  const result = new Date(matchingInstants[0]);
  return Number.isNaN(result.getTime())
    ? { iso: null, error: "invalid" }
    : { iso: result.toISOString(), error: null };
}

/**
 * Converts a datetime-local value in Europe/Oslo to an absolute ISO instant.
 * Invalid calendar dates and DST gaps/folds are rejected rather than being
 * silently normalized by Date or Intl.
 */
export function osloLocalDateTimeToIso(value: string): string | null {
  return resolveOsloLocalDateTime(value).iso;
}

function osloDateTimeErrorMessage(error: OsloLocalDateTimeResult["error"]): string | null {
  if (error === "nonexistent") {
    return "Tidspunktet finnes ikke i Oslo på grunn av overgangen til sommertid. Velg et annet klokkeslett.";
  }
  if (error === "ambiguous") {
    return "Tidspunktet er tvetydig i Oslo når klokken stilles tilbake. Velg et annet klokkeslett.";
  }
  if (error === "invalid") return "Velg et gyldig tidspunkt i Oslo.";
  return null;
}

function formatDue(value: string | Date | null | undefined): string {
  if (!value) return "–";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Ugyldig tidspunkt";
  return new Intl.DateTimeFormat("nb-NO", {
    timeZone: SCHEDULED_MESSAGING_TIMEZONE,
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function statusLabel(status: string): string {
  if (status === "sent") return "Sendt";
  if (status === "error") return "Feil";
  if (status === "cancelled") return "Kansellert";
  return "Venter";
}

function statusIcon(status: string) {
  if (status === "sent") return <CheckCircle2 className="h-3.5 w-3.5" />;
  if (status === "error") return <XCircle className="h-3.5 w-3.5" />;
  return <Clock3 className="h-3.5 w-3.5" />;
}

function statusVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  if (status === "sent") return "default";
  if (status === "error") return "destructive";
  if (status === "cancelled") return "outline";
  return "secondary";
}

type Props = {
  users: User[];
};

type ScheduleDraft = {
  requestId: string;
  recipientId: string;
  recipientName: string;
  subject: string;
  message: string;
  dueLocal: string;
  isoDue: string;
};

export function ScheduledMessageComposer({ users }: Props) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [recipientId, setRecipientId] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [dueLocal, setDueLocal] = useState(APPROVED_WELCOME_DUE);
  const [formError, setFormError] = useState("");
  const [confirmation, setConfirmation] = useState<ScheduleDraft | null>(null);

  const employees = useMemo(
    () =>
      users
        .filter((user) => user.role === "ansatt" && user.status !== "Deaktivert")
        .filter((user) => {
          const needle = search.trim().toLocaleLowerCase("no");
          return !needle || `${user.name} ${user.region}`.toLocaleLowerCase("no").includes(needle);
        }),
    [search, users],
  );
  const recipient = users.find((user) => user.id === recipientId);
  const dueResolution = useMemo(() => resolveOsloLocalDateTime(dueLocal), [dueLocal]);
  const dueIso = dueResolution.iso;
  const dueError = osloDateTimeErrorMessage(dueResolution.error);

  const { data: scheduled = [], isLoading } = useQuery<ScheduledMelding[]>({
    queryKey: ["/api/admin/scheduled-meldinger"],
    enabled: open,
  });

  const createSchedule = useMutation({
    mutationFn: async (draft: ScheduleDraft) => {
      if (new Date(draft.isoDue).getTime() <= Date.now()) {
        throw new Error("Tidspunktet må være i fremtiden.");
      }
      const response = await apiRequest("POST", "/api/admin/scheduled-meldinger", {
        requestId: draft.requestId,
        toUserId: draft.recipientId,
        subject: draft.subject,
        message: draft.message,
        scheduledFor: draft.isoDue,
        timezone: SCHEDULED_MESSAGING_TIMEZONE,
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/scheduled-meldinger"] });
      toast({ title: "Melding planlagt", description: "Den blir synlig for mottakeren først ved tidspunktet." });
      setRecipientId("");
      setSearch("");
      setSubject("");
      setMessage("");
      setFormError("");
      setConfirmation(null);
    },
    onError: (error: Error) => {
      setFormError(error.message.replace(/^\d+:\s*/, ""));
    },
  });

  const cancelSchedule = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/admin/scheduled-meldinger/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/scheduled-meldinger"] });
      toast({ title: "Planlagt melding kansellert" });
    },
    onError: (error: Error) => {
      toast({ title: "Kunne ikke kansellere", description: error.message, variant: "destructive" });
    },
  });

  const submit = () => {
    setFormError("");
    if (!recipientId || !subject.trim() || !message.trim()) {
      setFormError("Velg mottaker og fyll ut emne og melding.");
      return;
    }

    if (!dueIso) {
      setFormError(dueError || "Velg et gyldig tidspunkt i Oslo.");
      return;
    }
    if (new Date(dueIso).getTime() <= Date.now()) {
      setFormError("Tidspunktet må være i fremtiden.");
      return;
    }

    setConfirmation({
      requestId: crypto.randomUUID(),
      recipientId,
      recipientName: recipient?.name || "ansatt",
      subject: subject.trim(),
      message: message.trim(),
      dueLocal,
      isoDue: dueIso,
    });
  };

  return (
    <Card>
      <CardHeader className="p-4">
        <Button
          variant="ghost"
          className="h-auto justify-between p-0 hover:bg-transparent"
          onClick={() => setOpen((value) => !value)}
          data-testid="button-toggle-scheduled-messaging"
        >
          <span className="flex items-center gap-2">
            <CalendarClock className="h-4 w-4 text-primary" />
            <span className="font-semibold">Planlegg melding til ansatt</span>
          </span>
          <ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} />
        </Button>
      </CardHeader>

      {open && (
        <CardContent className="space-y-5 p-4 pt-0">
          <div
            className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-muted-foreground"
            role="note"
          >
            <p>
              Tidspunkt tolkes alltid i <strong className="text-foreground">{SCHEDULED_MESSAGING_TIMEZONE}</strong>.
            </p>
            <p className="mt-1">
              Planlagt sending krever en publisert server som kjører kontinuerlig (always-on). Autoscale alene
              garanterer ikke at meldingen blir sendt ved forfall.
            </p>
          </div>

          {!confirmation ? (
            <>
              <div className="space-y-3">
            <div>
              <label className="mb-1.5 block text-sm font-medium">Mottaker</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={recipient ? recipient.name : search}
                  onChange={(event) => {
                    setRecipientId("");
                    setSearch(event.target.value);
                  }}
                  placeholder="Søk etter ansatt..."
                  className="pl-9"
                  data-testid="input-scheduled-recipient"
                />
              </div>
              {!recipientId && (
                <div className="mt-1 max-h-36 overflow-y-auto rounded-md border">
                  {employees.length === 0 ? (
                    <p className="p-2 text-xs text-muted-foreground">Ingen ansatte funnet</p>
                  ) : (
                    employees.map((user) => (
                      <button
                        type="button"
                        key={user.id}
                        onClick={() => {
                          setRecipientId(user.id);
                          setSearch("");
                        }}
                        className="flex w-full items-center gap-2 p-2 text-left text-sm hover:bg-muted"
                        data-testid={`button-scheduled-recipient-${user.id}`}
                      >
                        <Avatar className="h-7 w-7">
                          {user.profileImage && <AvatarImage src={user.profileImage} alt="" />}
                          <AvatarFallback className="bg-primary text-[10px] text-primary-foreground">
                            {user.name.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <span className="font-medium">{user.name}</span>
                        <span className="ml-auto text-xs text-muted-foreground">{user.region}</span>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium">Emne</label>
              <Input
                value={subject}
                onChange={(event) => setSubject(event.target.value)}
                placeholder="Skriv emne..."
                data-testid="input-scheduled-subject"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium">Melding</label>
              <Textarea
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                placeholder="Skriv melding..."
                rows={7}
                data-testid="input-scheduled-message"
              />
              <Button
                type="button"
                variant="ghost"
                className="h-auto px-0 text-xs"
                onClick={() => {
                  setMessage(APPROVED_WELCOME_MESSAGE);
                  setDueLocal(APPROVED_WELCOME_DUE);
                  setSubject("Lykke til på første vakt");
                }}
                data-testid="button-prefill-approved-welcome"
              >
                Bruk godkjent velkomstutkast
              </Button>
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium">Sendes</label>
              <Input
                type="datetime-local"
                value={dueLocal}
                onChange={(event) => setDueLocal(event.target.value)}
                data-testid="input-scheduled-due"
              />
              {dueError ? (
                <p className="mt-1 text-xs text-destructive">{dueError}</p>
              ) : (
                <p className="mt-1 text-xs text-muted-foreground">
                  {formatDue(dueIso)} ({SCHEDULED_MESSAGING_TIMEZONE})
                </p>
              )}
            </div>
              </div>

              {recipient && subject.trim() && message.trim() && (
                <div className="rounded-md border bg-muted/30 p-3">
                  <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-muted-foreground">
                    <Eye className="h-3.5 w-3.5" /> Forhåndsvisning
                  </div>
                  <p className="text-sm font-semibold">{subject}</p>
                  <p className="mt-1 whitespace-pre-wrap text-sm">{message}</p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Til {recipient.name} · {formatDue(dueIso)} {SCHEDULED_MESSAGING_TIMEZONE}
                  </p>
              </div>
              )}

              {formError && <p className="text-sm text-destructive">{formError}</p>}
              <Button
                className="w-full"
                onClick={submit}
                disabled={createSchedule.isPending || !recipientId || !subject.trim() || !message.trim() || !dueIso}
                data-testid="button-schedule-message"
              >
                <Eye className="mr-2 h-4 w-4" />
                Fortsett til bekreftelse
              </Button>
            </>
          ) : (
            <div className="space-y-4 rounded-md border border-primary/30 bg-primary/5 p-4" role="dialog" aria-modal="false">
              <div>
                <h3 className="text-base font-semibold">Bekreft planlagt sending</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  Kontroller mottaker, tidspunkt og hele meldingen før den planlegges.
                </p>
              </div>
              <div className="space-y-2 text-sm">
                <p>
                  <span className="font-semibold">Mottaker:</span> {confirmation.recipientName}
                </p>
                <p>
                  <span className="font-semibold">Sendes:</span> {formatDue(confirmation.isoDue)} (
                  {SCHEDULED_MESSAGING_TIMEZONE})
                </p>
                <div>
                  <p className="font-semibold">Emne:</p>
                  <p className="mt-1">{confirmation.subject}</p>
                </div>
                <div>
                  <p className="font-semibold">Full melding:</p>
                  <p className="mt-1 whitespace-pre-wrap">{confirmation.message}</p>
                </div>
              </div>
              {formError && <p className="text-sm text-destructive">{formError}</p>}
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setFormError("");
                    setConfirmation(null);
                  }}
                  disabled={createSchedule.isPending}
                >
                  Tilbake og rediger
                </Button>
                <Button
                  type="button"
                  onClick={() => createSchedule.mutate(confirmation)}
                  disabled={createSchedule.isPending}
                  data-testid="button-confirm-scheduled-message"
                >
                  <Send className="mr-2 h-4 w-4" />
                  Bekreft planlagt sending
                </Button>
              </div>
            </div>
          )}

          <div className="space-y-2 border-t pt-4">
            <h3 className="text-sm font-semibold">Planlagte og leverte meldinger</h3>
            {isLoading ? (
              <p className="text-xs text-muted-foreground">Laster...</p>
            ) : scheduled.length === 0 ? (
              <p className="text-xs text-muted-foreground">Ingen planlagte meldinger.</p>
            ) : (
              scheduled.map((item) => {
                const itemRecipient = users.find((user) => user.id === item.toUserId);
                const canCancel = item.status === "pending" || item.status === "error";
                return (
                  <div key={item.id} className="rounded-md border p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{item.subject}</p>
                        <p className="text-xs text-muted-foreground">
                          Til {itemRecipient?.name || "ansatt"} · {formatDue(item.scheduledFor)} {item.timezone}
                        </p>
                      </div>
                      <Badge variant={statusVariant(item.status)} className="shrink-0 gap-1">
                        {statusIcon(item.status)} {statusLabel(item.status)}
                      </Badge>
                    </div>
                    {item.status === "error" && item.lastError && (
                      <p className="mt-2 text-xs text-destructive">{item.lastError}</p>
                    )}
                    {canCancel && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="mt-2 h-7 px-2 text-xs text-destructive"
                        onClick={() => cancelSchedule.mutate(item.id)}
                        disabled={cancelSchedule.isPending}
                        data-testid={`button-cancel-scheduled-${item.id}`}
                      >
                        Kanseller
                      </Button>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </CardContent>
      )}
    </Card>
  );
}
