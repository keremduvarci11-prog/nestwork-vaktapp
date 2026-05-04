import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Calendar as CalendarComp } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  MapPin,
  AlertCircle,
  Briefcase,
  Lock,
  Unlock,
} from "lucide-react";
import { nb } from "date-fns/locale";

interface AvailableEmp {
  userId: string;
  name: string;
  stilling: string;
  region: string;
  profileImage: string | null;
  status: "available" | "assigned";
}
interface ByDateResponse {
  blocked: boolean;
  employees: AvailableEmp[];
}

const toIso = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

const fromIso = (s: string) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
};

export default function AdminTilgjengelighet() {
  const { toast } = useToast();
  const [selectedDate, setSelectedDate] = useState<string>(() => toIso(new Date()));
  const [calOpen, setCalOpen] = useState(false);

  const dateObj = fromIso(selectedDate);
  const longLabel = dateObj.toLocaleDateString("nb-NO", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  const shiftDay = (delta: number) => {
    const d = fromIso(selectedDate);
    d.setDate(d.getDate() + delta);
    setSelectedDate(toIso(d));
  };

  const { data, isLoading } = useQuery<ByDateResponse>({
    queryKey: ["/api/admin/availability/by-date", selectedDate],
  });

  const isBlocked = !!data?.blocked;
  const employees = data?.employees || [];
  const sorted = employees.slice().sort((a, b) => {
    if (a.status !== b.status) return a.status === "available" ? -1 : 1;
    return a.name.localeCompare(b.name, "nb");
  });

  const ledigeCount = sorted.filter((e) => e.status === "available").length;
  const tildeltCount = sorted.filter((e) => e.status === "assigned").length;

  const blockMutation = useMutation({
    mutationFn: async () => apiRequest("POST", "/api/admin/blocked-dates", { date: selectedDate }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/availability/by-date"] });
      queryClient.invalidateQueries({ queryKey: ["/api/blocked-dates"] });
      toast({ title: "Dato blokkert", description: longLabel });
    },
    onError: (err: any) => {
      toast({ title: "Kunne ikke blokkere", description: err?.message || "", variant: "destructive" });
    },
  });

  const unblockMutation = useMutation({
    mutationFn: async () => apiRequest("DELETE", `/api/admin/blocked-dates/${selectedDate}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/availability/by-date"] });
      queryClient.invalidateQueries({ queryKey: ["/api/blocked-dates"] });
      toast({ title: "Blokkering fjernet", description: longLabel });
    },
    onError: (err: any) => {
      toast({ title: "Kunne ikke fjerne blokkering", description: err?.message || "", variant: "destructive" });
    },
  });

  return (
    <div className="space-y-5" data-testid="page-admin-tilgjengelighet">
      <div>
        <h1 className="text-xl font-bold">Tilgjengelighet</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Se ledige ansatte eller blokker en dag (helligdager / stengt).
        </p>
      </div>

      {/* Date header med piler */}
      <Card>
        <CardContent className="p-3">
          <div className="flex items-center justify-between gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => shiftDay(-1)}
              data-testid="button-prev-day"
              aria-label="Forrige dag"
            >
              <ChevronLeft className="w-5 h-5" />
            </Button>

            <Popover open={calOpen} onOpenChange={setCalOpen}>
              <PopoverTrigger asChild>
                <button
                  data-testid="button-open-calendar"
                  className="flex-1 flex items-center justify-center gap-2 py-2 rounded-md hover-elevate active-elevate-2"
                >
                  <CalendarDays className="w-4 h-4 text-primary" />
                  <span className="font-semibold capitalize" data-testid="text-selected-date">
                    {longLabel}
                  </span>
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="center">
                <CalendarComp
                  mode="single"
                  locale={nb}
                  selected={dateObj}
                  onSelect={(d) => {
                    if (d) {
                      setSelectedDate(toIso(d));
                      setCalOpen(false);
                    }
                  }}
                  initialFocus
                />
              </PopoverContent>
            </Popover>

            <Button
              variant="ghost"
              size="icon"
              onClick={() => shiftDay(1)}
              data-testid="button-next-day"
              aria-label="Neste dag"
            >
              <ChevronRight className="w-5 h-5" />
            </Button>
          </div>

          {/* Block / unblock kontroll */}
          <div className="flex items-center justify-center mt-2">
            {isBlocked ? (
              <Button
                size="sm"
                variant="outline"
                onClick={() => unblockMutation.mutate()}
                disabled={unblockMutation.isPending}
                data-testid="button-unblock-date"
              >
                <Unlock className="w-3.5 h-3.5 mr-1.5" />
                Fjern blokkering
              </Button>
            ) : (
              <Button
                size="sm"
                variant="outline"
                onClick={() => blockMutation.mutate()}
                disabled={blockMutation.isPending}
                data-testid="button-block-date"
              >
                <Lock className="w-3.5 h-3.5 mr-1.5" />
                Blokker dato
              </Button>
            )}
          </div>

          {!isBlocked && !isLoading && sorted.length > 0 && (
            <div className="flex items-center justify-center gap-3 mt-2 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-green-500" />
                {ledigeCount} ledige
              </span>
              {tildeltCount > 0 && (
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-orange-500" />
                  {tildeltCount} tildelt vakt
                </span>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Innhold */}
      {isBlocked ? (
        <Card data-testid="card-blocked-banner">
          <CardContent className="py-10 text-center">
            <Lock className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
            <p className="font-medium">Dagen er blokkert</p>
            <p className="text-sm text-muted-foreground mt-1">
              Ansatte kan ikke sette tilgjengelighet på blokkerte dager.
            </p>
          </CardContent>
        </Card>
      ) : isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-16 w-full rounded-md" />
          ))}
        </div>
      ) : sorted.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <AlertCircle className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
            <p className="font-medium">Ingen markert som ledige</p>
            <p className="text-sm text-muted-foreground mt-1">
              Ingen ansatte har satt seg som tilgjengelige på denne datoen.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {sorted.map((emp) => {
            const initials = emp.name
              .split(" ")
              .map((n) => n[0])
              .join("")
              .toUpperCase();
            const isAssigned = emp.status === "assigned";
            return (
              <Card key={emp.userId} data-testid={`card-emp-${emp.userId}`}>
                <CardContent className="p-3">
                  <div className="flex items-center gap-3">
                    <Avatar className="w-10 h-10">
                      {emp.profileImage && <AvatarImage src={emp.profileImage} alt={emp.name} />}
                      <AvatarFallback className="bg-primary text-primary-foreground text-sm font-bold">
                        {initials}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm truncate" data-testid={`text-name-${emp.userId}`}>
                        {emp.name}
                      </p>
                      <p className="text-xs text-muted-foreground flex items-center gap-2 mt-0.5">
                        <span className="truncate">{emp.stilling || "Ansatt"}</span>
                        <span className="inline-flex items-center gap-0.5">
                          <MapPin className="w-3 h-3" />
                          {emp.region}
                        </span>
                      </p>
                    </div>
                    <span
                      data-testid={`status-${emp.userId}`}
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium flex-shrink-0 ${
                        isAssigned
                          ? "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200"
                          : "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                      }`}
                    >
                      {isAssigned ? (
                        <>
                          <Briefcase className="w-3 h-3" />
                          Tildelt vakt
                        </>
                      ) : (
                        <>
                          <span className="w-2 h-2 rounded-full bg-green-500" />
                          Ledig
                        </>
                      )}
                    </span>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
