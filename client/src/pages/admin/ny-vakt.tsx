import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Plus, Search, X, UserCheck, Coffee, Clock } from "lucide-react";
import type { Barnehage, User } from "@shared/schema";
import { calculatePaidHours, shouldDeductPause, hasPolicyPaidBreak } from "@shared/shiftHours";
import { Week39Plan } from "@/components/admin/week39-plan";

export default function NyVakt() {
  const { toast } = useToast();
  const [barnehageId, setBarnehageId] = useState("");
  const [dato, setDato] = useState("");
  const [startTid, setStartTid] = useState("07:30");
  const [sluttTid, setSluttTid] = useState("15:30");
  const [vikarkode, setVikarkode] = useState("");
  const [beskrivelse, setBeskrivelse] = useState("");
  const [ansattId, setAnsattId] = useState("");
  const [ansattSearch, setAnsattSearch] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const [betaltPause, setBetaltPause] = useState(false);
  const [avtalteBetalteTimer, setAvtalteBetalteTimer] = useState("");
  const policyPaidBreak = hasPolicyPaidBreak(dato, barnehageId);
  const effectiveBetaltPause = policyPaidBreak || betaltPause;

  const { data: barnehager } = useQuery<Barnehage[]>({
    queryKey: ["/api/barnehager"],
  });

  const { data: users } = useQuery<User[]>({
    queryKey: ["/api/users"],
  });

  const ansatte = useMemo(() =>
    (users || []).filter((u) => u.role === "ansatt"),
    [users]
  );

  const filteredAnsatte = useMemo(() => {
    if (!ansattSearch.trim()) return ansatte;
    const q = ansattSearch.toLowerCase();
    return ansatte.filter(
      (a) =>
        a.name.toLowerCase().includes(q) ||
        a.region.toLowerCase().includes(q) ||
        a.phone?.toLowerCase().includes(q)
    );
  }, [ansatte, ansattSearch]);

  const selectedAnsatt = ansatte.find((a) => a.id === ansattId);
  const selectedBh = barnehager?.find((b) => b.id === barnehageId);

  const calcHours = () => {
    return calculatePaidHours(startTid, sluttTid, {
      betaltPause: effectiveBetaltPause,
      avtalteBetalteTimer: avtalteBetalteTimer || null,
    });
  };
  const automaticPause = shouldDeductPause(startTid, sluttTid, {
    betaltPause: effectiveBetaltPause,
    avtalteBetalteTimer: avtalteBetalteTimer || null,
  });

  const createVakt = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/vakter", {
        barnehageId,
        dato,
        startTid,
        sluttTid,
        vikarkode,
        status: ansattId ? "tildelt" : "ledig",
        ansattId: ansattId || null,
        region: selectedBh?.region || "",
        beskrivelse,
        betaltPause: effectiveBetaltPause,
        avtalteBetalteTimer: avtalteBetalteTimer || null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/vakter"] });
      const msg = ansattId
        ? `Vakt opprettet og tildelt ${selectedAnsatt?.name}!`
        : "Vakt opprettet!";
      toast({ title: msg, description: ansattId ? "Den ansatte kan nå godta vakten." : "Ansatte i regionen kan nå se vakten." });
      setBarnehageId("");
      setDato("");
      setVikarkode("");
      setBeskrivelse("");
      setAnsattId("");
      setAnsattSearch("");
      setShowSearch(false);
      setBetaltPause(false);
      setAvtalteBetalteTimer("");
    },
    onError: () => {
      toast({ title: "Feil", description: "Kunne ikke opprette vakt", variant: "destructive" });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!barnehageId || !dato || !vikarkode) return;
    createVakt.mutate();
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">Legg ut ny vakt</h1>
        <p className="text-sm text-muted-foreground mt-1">Opprett en ny vakt for ansatte</p>
      </div>

      <Week39Plan />
      <Week39Plan employee="sultan" />

      <Card>
        <CardContent className="p-4">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Barnehage</label>
              <Select value={barnehageId} onValueChange={setBarnehageId}>
                <SelectTrigger data-testid="select-barnehage">
                  <SelectValue placeholder="Velg barnehage" />
                </SelectTrigger>
                <SelectContent>
                  {barnehager?.map((b) => (
                    <SelectItem key={b.id} value={b.id}>{b.name} ({b.region})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Dato</label>
              <Input
                data-testid="input-dato"
                type="date"
                value={dato}
                onChange={(e) => setDato(e.target.value)}
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <label className="text-sm font-medium">Starttid</label>
                <Input
                  data-testid="input-start-tid"
                  type="time"
                  value={startTid}
                  onChange={(e) => setStartTid(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Sluttid</label>
                <Input
                  data-testid="input-slutt-tid"
                  type="time"
                  value={sluttTid}
                  onChange={(e) => setSluttTid(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="flex items-center justify-between gap-3 p-3 rounded-lg bg-muted/50 border">
              <div className="flex items-center gap-2">
                <Coffee className="w-4 h-4 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">Betalt pause på denne vakten</p>
                  <p className="text-xs text-muted-foreground">
                    {avtalteBetalteTimer
                      ? `Avtalte betalte timer: ${calcHours().toFixed(2)}`
                      : effectiveBetaltPause
                        ? "Ingen pausetrekk"
                        : automaticPause
                          ? "30 min ubetalt pause trekkes automatisk"
                          : "Ingen pause for vakter under 5,5 timer"}
                  </p>
                </div>
              </div>
              <Switch
                checked={effectiveBetaltPause}
                disabled={policyPaidBreak}
                onCheckedChange={setBetaltPause}
                data-testid="switch-betalt-pause"
              />
            </div>
            {policyPaidBreak && (
              <p className="text-xs text-muted-foreground">Betalt pause gjelder ved denne barnehagen fra 01.09.2026.</p>
            )}

            <div className="space-y-2">
              <label className="text-sm font-medium">Avtalte betalte timer (valgfritt)</label>
              <Input
                type="number"
                min="0"
                max="24"
                step="0.01"
                value={avtalteBetalteTimer}
                onChange={(e) => setAvtalteBetalteTimer(e.target.value)}
                placeholder="F.eks. 7,5"
                data-testid="input-avtalte-betalte-timer"
              />
              <p className="text-xs text-muted-foreground">
                Overstyrer automatisk pausetrekk for denne vakten.
              </p>
            </div>

            {startTid && sluttTid && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Clock className="w-3.5 h-3.5" />
                <span>
                  Betalte timer: <strong className="text-foreground">{calcHours().toFixed(1)}t</strong>
                  {automaticPause && " (30 min pause trukket)"}
                </span>
              </div>
            )}

            <div className="space-y-2">
              <label className="text-sm font-medium">Vikarkode</label>
              <Select value={vikarkode} onValueChange={setVikarkode}>
                <SelectTrigger data-testid="select-vikarkode">
                  <SelectValue placeholder="Velg vikarkode" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="KTV">KTV - Korttidsvikar</SelectItem>
                  <SelectItem value="LTV">LTV - Langtidsvikar</SelectItem>
                  <SelectItem value="LTV-NAV">LTV-NAV - NAV-tiltak</SelectItem>
                  <SelectItem value="RES">RES - Reserve</SelectItem>
                  <SelectItem value="TEST">TEST - Test vakt</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Tildel til ansatt (valgfritt)</label>
              {selectedAnsatt ? (
                <div className="flex items-center justify-between p-2.5 rounded-md border bg-purple-50 dark:bg-purple-950/30 border-purple-200 dark:border-purple-800">
                  <div className="flex items-center gap-2">
                    <UserCheck className="w-4 h-4 text-purple-600" />
                    <div>
                      <p className="text-sm font-medium">{selectedAnsatt.name}</p>
                      <p className="text-xs text-muted-foreground">{selectedAnsatt.region} - {selectedAnsatt.stilling}</p>
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => { setAnsattId(""); setAnsattSearch(""); }}
                    data-testid="button-remove-ansatt"
                  >
                    <X className="w-3.5 h-3.5" />
                  </Button>
                </div>
              ) : (
                <div className="space-y-1">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
                    <Input
                      data-testid="input-search-ansatt"
                      placeholder="Sok etter ansatt (navn, region, telefon)..."
                      value={ansattSearch}
                      onChange={(e) => { setAnsattSearch(e.target.value); setShowSearch(true); }}
                      onFocus={() => setShowSearch(true)}
                      className="pl-9"
                    />
                  </div>
                  {showSearch && (
                    <div className="max-h-48 overflow-y-auto rounded-md border bg-background shadow-md">
                      {filteredAnsatte.length === 0 ? (
                        <p className="p-3 text-sm text-muted-foreground">Ingen treff</p>
                      ) : (
                        filteredAnsatte.map((a) => (
                          <button
                            key={a.id}
                            type="button"
                            className="w-full text-left px-3 py-2 hover:bg-muted flex items-center justify-between border-b last:border-0"
                            onClick={() => {
                              setAnsattId(a.id);
                              setAnsattSearch("");
                              setShowSearch(false);
                            }}
                            data-testid={`option-ansatt-${a.id}`}
                          >
                            <div>
                              <p className="text-sm font-medium">{a.name}</p>
                              <p className="text-xs text-muted-foreground">{a.region} - {a.stilling}</p>
                            </div>
                            {a.phone && (
                              <span className="text-xs text-muted-foreground">{a.phone}</span>
                            )}
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                {ansattId ? "Vakten tildeles direkte til denne ansatte." : "La feltet stå tomt for å publisere som ledig vakt."}
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Beskrivelse</label>
              <Textarea
                data-testid="input-beskrivelse"
                placeholder="Beskriv vakten..."
                value={beskrivelse}
                onChange={(e) => setBeskrivelse(e.target.value)}
                rows={3}
              />
            </div>

            <Button
              data-testid="button-opprett-vakt"
              type="submit"
              className="w-full"
              disabled={createVakt.isPending || !barnehageId || !dato || !vikarkode}
            >
              <Plus className="w-4 h-4 mr-2" />
              {ansattId ? "OPPRETT OG TILDEL VAKT" : "OPPRETT VAKT"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
