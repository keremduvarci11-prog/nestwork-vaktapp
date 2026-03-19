import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ArrowLeft, Trash2, Pencil, Calendar, Clock, Building2, User, Save, X, AlertCircle, UserPlus, Coffee } from "lucide-react";
import type { Vakt, Barnehage, User as UserType } from "@shared/schema";
import { useLocation } from "wouter";

const statusLabels: Record<string, { label: string; className: string }> = {
  ledig: { label: "Ledig", className: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" },
  tildelt: { label: "Tildelt", className: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200" },
  venter: { label: "Venter", className: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200" },
  godkjent: { label: "Godkjent", className: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200" },
};

function EditVaktForm({
  vakt,
  barnehager,
  users,
  onCancel,
  onSaved,
}: {
  vakt: Vakt;
  barnehager: Barnehage[];
  users: UserType[];
  onCancel: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [barnehageId, setBarnehageId] = useState(vakt.barnehageId);
  const [dato, setDato] = useState(vakt.dato);
  const [startTid, setStartTid] = useState(vakt.startTid?.slice(0, 5) || "07:30");
  const [sluttTid, setSluttTid] = useState(vakt.sluttTid?.slice(0, 5) || "15:30");
  const [vikarkode, setVikarkode] = useState(vakt.vikarkode);
  const [beskrivelse, setBeskrivelse] = useState(vakt.beskrivelse || "");
  const [status, setStatus] = useState(vakt.status);
  const [ansattId, setAnsattId] = useState(vakt.ansattId || "");
  const [trekkPause, setTrekkPause] = useState(vakt.trekkPause || false);

  const selectedBh = barnehager.find((b) => b.id === barnehageId);

  const updateVakt = useMutation({
    mutationFn: () =>
      apiRequest("PATCH", `/api/vakter/${vakt.id}`, {
        barnehageId,
        dato,
        startTid,
        sluttTid,
        vikarkode,
        beskrivelse,
        status,
        region: selectedBh?.region || vakt.region,
        ansattId: ansattId || null,
        trekkPause,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/vakter"] });
      toast({ title: "Vakt oppdatert" });
      onSaved();
    },
    onError: () => {
      toast({ title: "Feil", description: "Kunne ikke oppdatere vakt", variant: "destructive" });
    },
  });

  const ansatte = users.filter((u) => u.role === "ansatt");

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-sm font-bold">Rediger vakt</h3>
          <Button variant="ghost" size="sm" onClick={onCancel} data-testid="button-cancel-edit">
            <X className="w-4 h-4" />
          </Button>
        </div>

        <div className="space-y-2">
          <label className="text-xs font-medium">Barnehage</label>
          <Select value={barnehageId} onValueChange={setBarnehageId}>
            <SelectTrigger data-testid="edit-select-barnehage">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {barnehager.map((b) => (
                <SelectItem key={b.id} value={b.id}>{b.name} ({b.region})</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <label className="text-xs font-medium">Dato</label>
          <Input type="date" value={dato} onChange={(e) => setDato(e.target.value)} data-testid="edit-input-dato" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <label className="text-xs font-medium">Start</label>
            <Input type="time" value={startTid} onChange={(e) => setStartTid(e.target.value)} data-testid="edit-input-start" />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-medium">Slutt</label>
            <Input type="time" value={sluttTid} onChange={(e) => setSluttTid(e.target.value)} data-testid="edit-input-slutt" />
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-xs font-medium">Vikarkode</label>
          <Select value={vikarkode} onValueChange={setVikarkode}>
            <SelectTrigger data-testid="edit-select-vikarkode">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="KTV">KTV - Korttidsvikar</SelectItem>
              <SelectItem value="LTV">LTV - Langtidsvikar</SelectItem>
              <SelectItem value="LTV-NAV">LTV-NAV - NAV-tiltak</SelectItem>
              <SelectItem value="RES">RES - Reserve</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <label className="text-xs font-medium">Status</label>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger data-testid="edit-select-status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ledig">Ledig</SelectItem>
              <SelectItem value="tildelt">Tildelt</SelectItem>
              <SelectItem value="venter">Venter</SelectItem>
              <SelectItem value="godkjent">Godkjent</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <label className="text-xs font-medium">Tildelt ansatt</label>
          <Select value={ansattId || "none"} onValueChange={(v) => setAnsattId(v === "none" ? "" : v)}>
            <SelectTrigger data-testid="edit-select-ansatt">
              <SelectValue placeholder="Ingen" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Ingen</SelectItem>
              {ansatte.map((a) => (
                <SelectItem key={a.id} value={a.id}>{a.name} ({a.region})</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center justify-between p-2.5 rounded-md bg-muted/50 border">
          <div className="flex items-center gap-2">
            <Coffee className="w-4 h-4 text-muted-foreground" />
            <span className="text-xs font-medium">Trekk 30 min pause</span>
          </div>
          <Switch
            checked={trekkPause}
            onCheckedChange={setTrekkPause}
            data-testid="edit-switch-trekk-pause"
          />
        </div>

        <div className="space-y-2">
          <label className="text-xs font-medium">Beskrivelse</label>
          <Textarea
            value={beskrivelse}
            onChange={(e) => setBeskrivelse(e.target.value)}
            rows={2}
            data-testid="edit-input-beskrivelse"
          />
        </div>

        <Button
          className="w-full"
          onClick={() => updateVakt.mutate()}
          disabled={updateVakt.isPending}
          data-testid="button-save-vakt"
        >
          <Save className="w-4 h-4 mr-1" />
          Lagre endringer
        </Button>
      </CardContent>
    </Card>
  );
}

export default function AlleVakter() {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [tildelingId, setTildelingId] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>("alle");

  const { data: vakter, isLoading } = useQuery<Vakt[]>({
    queryKey: ["/api/vakter"],
  });
  const { data: barnehager } = useQuery<Barnehage[]>({
    queryKey: ["/api/barnehager"],
  });
  const { data: users } = useQuery<UserType[]>({
    queryKey: ["/api/users"],
  });

  const deleteVakt = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/vakter/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/vakter"] });
      toast({ title: "Vakt slettet" });
      setDeletingId(null);
    },
    onError: () => {
      toast({ title: "Feil", description: "Kunne ikke slette vakt", variant: "destructive" });
    },
  });

  const tildelVakt = useMutation({
    mutationFn: ({ vaktId, ansattId }: { vaktId: string; ansattId: string }) =>
      apiRequest("POST", `/api/vakter/${vaktId}/tildel`, { ansattId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/vakter"] });
      toast({ title: "Vakt tildelt", description: "Den ansatte kan nå godta vakten." });
      setTildelingId(null);
    },
    onError: () => {
      toast({ title: "Feil", description: "Kunne ikke tildele vakt", variant: "destructive" });
    },
  });

  const bhMap = new Map(barnehager?.map((b) => [b.id, b]) || []);
  const userMap = new Map(users?.map((u) => [u.id, u]) || []);

  const filteredVakter = vakter?.filter((v) => {
    if (filter === "alle") return true;
    return v.status === filter;
  }).sort((a, b) => (a.dato > b.dato ? -1 : 1)) || [];

  const formatDate = (d: string) => {
    const date = new Date(d + "T00:00:00");
    return date.toLocaleDateString("nb-NO", { weekday: "short", day: "numeric", month: "short" });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate("/admin")} data-testid="button-back-dashboard">
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div>
          <h1 className="text-xl font-bold">Alle vakter</h1>
          <p className="text-sm text-muted-foreground">{filteredVakter.length} vakter</p>
        </div>
      </div>

      <div className="flex gap-2">
        {["alle", "ledig", "tildelt", "venter", "godkjent"].map((f) => (
          <Button
            key={f}
            variant={filter === f ? "default" : "outline"}
            size="sm"
            onClick={() => setFilter(f)}
            data-testid={`filter-${f}`}
          >
            {f === "alle" ? "Alle" : statusLabels[f]?.label || f}
          </Button>
        ))}
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-28 w-full rounded-md" />)}
        </div>
      ) : filteredVakter.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <AlertCircle className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
            <p className="font-medium">Ingen vakter funnet</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filteredVakter.map((vakt) => {
            if (editingId === vakt.id) {
              return (
                <EditVaktForm
                  key={vakt.id}
                  vakt={vakt}
                  barnehager={barnehager || []}
                  users={users || []}
                  onCancel={() => setEditingId(null)}
                  onSaved={() => setEditingId(null)}
                />
              );
            }

            const bh = bhMap.get(vakt.barnehageId);
            const emp = vakt.ansattId ? userMap.get(vakt.ansattId) : null;
            const st = statusLabels[vakt.status] || statusLabels.ledig;

            return (
              <Card key={vakt.id} data-testid={`card-vakt-${vakt.id}`}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="min-w-0">
                      <h3 className="font-semibold text-sm truncate">{bh?.name || "Ukjent"}</h3>
                      <div className="flex items-center gap-2 mt-1">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${st.className}`}>{st.label}</span>
                        <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">{vakt.vikarkode}</span>
                      </div>
                    </div>
                    <div className="flex gap-1 flex-shrink-0">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setEditingId(vakt.id)}
                        data-testid={`button-edit-${vakt.id}`}
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      {deletingId === vakt.id ? (
                        <div className="flex gap-1">
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => deleteVakt.mutate(vakt.id)}
                            disabled={deleteVakt.isPending}
                            data-testid={`button-confirm-delete-${vakt.id}`}
                          >
                            Slett
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setDeletingId(null)}
                            data-testid={`button-cancel-delete-${vakt.id}`}
                          >
                            Avbryt
                          </Button>
                        </div>
                      ) : (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setDeletingId(vakt.id)}
                          data-testid={`button-delete-${vakt.id}`}
                        >
                          <Trash2 className="w-3.5 h-3.5 text-red-500" />
                        </Button>
                      )}
                    </div>
                  </div>

                  <div className="space-y-1 text-sm">
                    {emp && (
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Avatar className="w-6 h-6 flex-shrink-0">
                          {emp.profileImage && <AvatarImage src={emp.profileImage} alt={emp.name} />}
                          <AvatarFallback className="bg-primary text-primary-foreground text-[9px] font-bold">
                            {emp.name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <span>{emp.name}</span>
                      </div>
                    )}
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Calendar className="w-3.5 h-3.5" />
                      <span>{formatDate(vakt.dato)}</span>
                    </div>
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Clock className="w-3.5 h-3.5" />
                      <span>{vakt.startTid?.slice(0, 5)} - {vakt.sluttTid?.slice(0, 5)}</span>
                    </div>
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Building2 className="w-3.5 h-3.5" />
                      <span>{vakt.region}</span>
                    </div>
                  </div>

                  {vakt.status === "ledig" && (
                    tildelingId === vakt.id ? (
                      <div className="mt-3 pt-3 border-t space-y-2">
                        <label className="text-xs font-medium">Velg ansatt å tildele</label>
                        <Select onValueChange={(ansattId) => tildelVakt.mutate({ vaktId: vakt.id, ansattId })}>
                          <SelectTrigger data-testid={`select-tildel-${vakt.id}`}>
                            <SelectValue placeholder="Velg ansatt..." />
                          </SelectTrigger>
                          <SelectContent>
                            {(users || []).filter((u) => u.role === "ansatt").map((a) => (
                              <SelectItem key={a.id} value={a.id}>{a.name} ({a.region})</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button variant="ghost" size="sm" onClick={() => setTildelingId(null)} data-testid={`button-cancel-tildel-${vakt.id}`}>
                          Avbryt
                        </Button>
                      </div>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full mt-3"
                        onClick={() => setTildelingId(vakt.id)}
                        data-testid={`button-tildel-${vakt.id}`}
                      >
                        <UserPlus className="w-3.5 h-3.5 mr-1.5" />
                        Tildel til ansatt
                      </Button>
                    )
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
