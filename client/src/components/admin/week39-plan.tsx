import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Week39PlanResponse, Week39ApplyResponse } from "@shared/week39";

function errorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "Kunne ikke kontrollere vaktene.";
  try {
    const data = JSON.parse(message.slice(message.indexOf("{")));
    return [data.message, ...(data.conflicts || [])].filter(Boolean).join(" ");
  } catch {
    return message;
  }
}

const actions = {
  create: "Mangler – opprettes og tildeles",
  assign: "Eksisterende ledig vakt – tildeles",
  reuse: "Finnes allerede – beholdes",
  conflict: "Konflikt – ingen endringer",
};

export function Week39Plan({ employee = "synne" }: { employee?: "synne" | "sultan" }) {
  const name = employee === "synne" ? "Synne" : "Sultan";
  const kindergarten = employee === "synne" ? "Løvstakken Barnehage" : "Hjellemarka FUS Barnehage";
  const endpoint = employee === "synne" ? "/api/admin/week39-plan" : "/api/admin/week39-plan/sultan";
  const [open, setOpen] = useState(false);
  const [vikarkode, setVikarkode] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [result, setResult] = useState<Week39ApplyResponse | null>(null);
  const preview = useQuery<Week39PlanResponse>({
    queryKey: [endpoint, vikarkode],
    queryFn: async () => {
      const response = await apiRequest("GET", `${endpoint}${vikarkode ? `?vikarkode=${encodeURIComponent(vikarkode)}` : ""}`);
      return response.json();
    },
    enabled: open,
    staleTime: 0,
    refetchOnWindowFocus: false,
  });
  const submit = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", endpoint, {
        confirmationToken: preview.data?.confirmationToken,
        confirmed,
        vikarkode,
      });
      return await response.json() as Week39ApplyResponse;
    },
    onSuccess: (data) => {
      setResult(data);
      setConfirmed(false);
      queryClient.invalidateQueries({ queryKey: ["/api/vakter"] });
      queryClient.invalidateQueries({ queryKey: [endpoint] });
    },
    onError: () => {
      setConfirmed(false);
      // Recheck after conflicts or a lost response; a retry must never duplicate shifts.
      preview.refetch();
    },
  });
  const data = preview.data;
  const blocked = !data?.confirmationToken || !!data?.conflicts.length || preview.isFetching ||
    preview.isError || !vikarkode || !confirmed || submit.isPending;

  return (
    <Card data-testid={`week39-plan-${employee}`}>
      <CardContent className="p-4 space-y-4">
        <div>
          <h2 className="font-semibold">Klargjort: {name} – uke 39</h2>
          <p className="text-sm text-muted-foreground">{kindergarten} · 21.–25. september 2026 · {employee === "synne" ? "betalt pause" : "30 min ubetalt pause"}</p>
        </div>
        {!open ? (
          <Button type="button" variant="outline" onClick={() => setOpen(true)} data-testid="week39-open">
            Kontroller og vis fem vakter
          </Button>
        ) : (
          <>
            <p className="text-sm">Ingenting opprettes før du bekrefter nedenfor. Tidligere uker endres ikke.</p>
            {preview.isFetching && <p role="status" className="text-sm">Kontrollerer eksisterende registreringer …</p>}
            {preview.isError && <p role="alert" className="text-sm text-destructive">{errorMessage(preview.error)}</p>}
            {data && (
              <>
                <div className="text-sm space-y-1">
                  <p><strong>Ansatt:</strong> {data.employee?.name || "Ikke entydig identifisert"}{data.employee?.externalId ? ` · ansattnr. ${data.employee.externalId}` : ""}</p>
                  <p><strong>Barnehage:</strong> {data.kindergarten?.name || "Ikke entydig identifisert"}</p>
                  <p><strong>Pause:</strong> {data.betaltPause ? "Betalt pause, ingen pausetrekk." : "Vanlig regel: 30 minutter ubetalt pause."}</p>
                </div>
                <div className="space-y-2">
                  {data.rows.map((row) => (
                    <div key={row.dato} className="rounded-md border p-3 text-sm" data-testid={`week39-row-${row.dato}`}>
                      <p className="font-medium">
                        {new Date(`${row.dato}T12:00:00`).toLocaleDateString("nb-NO", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
                      </p>
                      <p>{row.startTid.slice(0, 5)}–{row.sluttTid.slice(0, 5)} · {row.paidHours.toLocaleString("nb-NO")} betalte timer · {data.betaltPause ? "betalt pause" : "30 min pausetrekk"}</p>
                      <p className={row.action === "conflict" ? "text-destructive" : "text-muted-foreground"}>{actions[row.action]}</p>
                      {row.detail && <p>{row.detail}</p>}
                      {row.vaktId && <p className="text-xs text-muted-foreground break-all">Vakt-ID: {row.vaktId}</p>}
                    </div>
                  ))}
                </div>
                <p className="font-semibold">Totalt: {data.totalPaidHours.toLocaleString("nb-NO")} betalte timer</p>
                {!!data.conflicts.length && (
                  <div role="alert" className="rounded-md border border-destructive p-3 text-sm text-destructive">
                    <p className="font-semibold">Konflikter må avklares. Ingen vakter blir endret.</p>
                    <ul className="list-disc pl-5">{data.conflicts.map((conflict, index) => <li key={index}>{conflict}</li>)}</ul>
                  </div>
                )}
                <div className="space-y-2">
                  <label className="text-sm font-medium">Vikarkode (kontrolleres også på eksisterende vakter)</label>
                  <Select value={vikarkode} onValueChange={(value) => { setVikarkode(value); setConfirmed(false); }} disabled={submit.isPending}>
                    <SelectTrigger data-testid="week39-code"><SelectValue placeholder="Velg vikarkode før bekreftelse" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="KTV">KTV – Korttidsvikar</SelectItem>
                      <SelectItem value="LTV">LTV – Langtidsvikar</SelectItem>
                      <SelectItem value="LTV-NAV">LTV-NAV – NAV-tiltak</SelectItem>
                      <SelectItem value="RES">RES – Reserve</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <label className="flex items-start gap-2 text-sm">
                  <input type="checkbox" className="mt-1" checked={confirmed}
                    disabled={!data.confirmationToken || submit.isPending || preview.isFetching}
                    onChange={(event) => setConfirmed(event.target.checked)} data-testid="week39-confirm-checkbox" />
                  <span>Jeg bekrefter de fem datoene og klokkeslettene, {name}, {kindergarten} og {data.betaltPause ? "betalt pause" : "30 minutter ubetalt pause"} med {data.totalPaidHours.toLocaleString("nb-NO")} betalte timer totalt.</span>
                </label>
                <p className="text-xs text-muted-foreground">
                  Bare manglende vakter opprettes. Identiske vakter beholdes. Nye tildelinger varsles som vanlig;
                  {name} må selv godta dem. Timer godkjennes ikke automatisk.
                </p>
                <Button type="button" disabled={blocked} onClick={() => submit.mutate()} data-testid="week39-submit">
                  {submit.isPending ? "Lagrer …" : "Bekreft opprettelse og tildeling"}
                </Button>
              </>
            )}
            {submit.isError && <p role="alert" className="text-sm text-destructive">{errorMessage(submit.error)} Kontroller oversikten på nytt før du prøver igjen.</p>}
            {result && (
              <div role="status" className="rounded-md border p-3 text-sm space-y-1" data-testid="week39-result">
                <p className="font-semibold">{result.message}</p>
                <p>Nye vakter: {result.created}. Nye tildelinger: {result.assigned}. Gjenbrukt: {result.reused}.</p>
                <p>Arksynk behandles av appens synkkø. Dette er ikke en bekreftelse på at Google-arket er oppdatert.</p>
                <details><summary>Vakt-ID-er fra appen</summary><ul>{result.vaktIds.map((id) => <li className="break-all" key={id}>{id}</li>)}</ul></details>
              </div>
            )}
            <Button type="button" variant="ghost" disabled={submit.isPending || preview.isFetching}
              onClick={() => { setConfirmed(false); preview.refetch(); }} data-testid="week39-refresh">
              Kontroller på nytt
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}