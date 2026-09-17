import { useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type ExistingUser = { id: string; name: string; email: string | null; externalId: number | null };
type CreatedUser = ExistingUser & { username: string; timelonn: string };
type FormValues = {
  name: string; email: string; phone: string; address: string;
  region: string; stilling: string; externalId: string; timelonn: string; password: string;
};

const emptyForm = (): FormValues => ({
  name: "", email: "", phone: "", address: "", region: "",
  stilling: "Barnehageassistent", externalId: "", timelonn: "", password: "",
});

function creationError(error: unknown): { message: string; existingUsers?: ExistingUser[] } {
  if (error instanceof Error) {
    const jsonStart = error.message.indexOf("{");
    if (jsonStart !== -1) {
      try {
        const body = JSON.parse(error.message.slice(jsonStart));
        return { message: body.message || "Kunne ikke opprette ansatt.", existingUsers: body.existingUsers };
      } catch { /* A connection failure may not have a JSON response. */ }
    }
  }
  return { message: "Kunne ikke bekrefte opprettelsen. Sjekk ansattlisten før du prøver igjen; duplikater blir stoppet." };
}

export function CreateEmployeeDialog({
  onClose, onSelectEmployee,
}: {
  onClose: () => void;
  onSelectEmployee: (id: string) => void;
}) {
  const { toast } = useToast();
  const [form, setForm] = useState(emptyForm);
  const [visiblePassword, setVisiblePassword] = useState(false);
  const [created, setCreated] = useState<CreatedUser | null>(null);
  const [failure, setFailure] = useState<ReturnType<typeof creationError> | null>(null);
  const submitting = useRef(false);

  const create = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/users", {
        ...form,
        name: form.name.trim(),
        email: form.email.trim(),
        externalId: form.externalId.trim() ? Number(form.externalId) : undefined,
        timelonn: form.timelonn.trim().replace(",", "."),
        role: "ansatt",
      });
      return response.json() as Promise<CreatedUser>;
    },
    onSuccess: (user) => {
      setCreated(user);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/onboarding-overview"] });
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
    },
    onError: error => setFailure(creationError(error)),
    onSettled: () => { submitting.current = false; },
  });

  const update = (key: keyof FormValues, value: string) => {
    setForm(current => ({ ...current, [key]: value }));
    setFailure(null);
  };
  const generatePassword = () => {
    const bytes = crypto.getRandomValues(new Uint8Array(18));
    update("password", `Nw!${Array.from(bytes, value => value.toString(16).padStart(2, "0")).join("")}`);
  };
  const copyPassword = async () => {
    try {
      await navigator.clipboard.writeText(form.password);
      toast({ title: "Passord kopiert", description: "Del det gjennom en trygg kanal." });
    } catch {
      toast({ title: "Kunne ikke kopiere", description: "Velg «Vis» for å kopiere passordet manuelt.", variant: "destructive" });
    }
  };

  const passwordField = (
    <div className="space-y-2">
      <Label htmlFor="create-employee-password">{created ? "Innloggingspassord" : "Passord (minst 12 tegn)"}</Label>
      <div className="flex gap-2">
        <Input
          id="create-employee-password"
          data-testid="create-employee-password"
          type={visiblePassword ? "text" : "password"}
          value={form.password}
          onChange={event => update("password", event.target.value)}
          minLength={12}
          maxLength={72}
          required
          autoComplete="new-password"
          readOnly={Boolean(created)}
        />
        <Button type="button" variant="outline" onClick={() => setVisiblePassword(value => !value)}
          aria-label={visiblePassword ? "Skjul passord" : "Vis passord"}>
          {visiblePassword ? "Skjul" : "Vis"}
        </Button>
      </div>
      <div className="flex gap-2 flex-wrap">
        {!created && <Button type="button" variant="outline" size="sm" onClick={generatePassword}>Lag sterkt passord</Button>}
        <Button type="button" variant="outline" size="sm" disabled={!form.password} onClick={copyPassword}>Kopier passord</Button>
      </div>
      <p className="text-xs text-muted-foreground">
        {created ? "Ta vare på passordet før du lukker. Det kan ikke hentes frem igjen her." : "Passordet lagres som en sikker hash. Ikke bruk fødselsnummer eller et felles standardpassord."}
      </p>
    </div>
  );

  return (
    <Dialog open onOpenChange={open => { if (!open && !submitting.current) onClose(); }}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{created ? "Ansatt opprettet" : "Opprett ansatt"}</DialogTitle>
          <DialogDescription>
            {created
              ? "Kontoen er lagret. Ingen invitasjon er sendt automatisk."
              : "Kontroller opplysningene og bekreft med «Opprett ansatt». Fødselsnummer og startdato registreres ikke her."}
          </DialogDescription>
        </DialogHeader>
        {created ? (
          <div className="space-y-4" data-testid="employee-created">
            <dl className="text-sm space-y-2 rounded-md border p-3">
              <div><dt className="text-muted-foreground">Navn</dt><dd className="font-medium">{created.name}</dd></div>
              <div><dt className="text-muted-foreground">Ansattnummer</dt><dd>{created.externalId ?? "Ikke oppgitt"}</dd></div>
              <div><dt className="text-muted-foreground">E-post / brukernavn</dt><dd>{created.email} / {created.username}</dd></div>
              <div><dt className="text-muted-foreground">Timelønn</dt><dd>{Number(created.timelonn).toLocaleString("nb-NO", { minimumFractionDigits: 2 })} kr</dd></div>
            </dl>
            {passwordField}
            <p className="text-sm text-muted-foreground">Del innloggingen sikkert med den ansatte. «Bytt passord» ligger i onboardingen.</p>
            <Button className="w-full" onClick={() => { onClose(); onSelectEmployee(created.id); }}>Vis ansatt</Button>
          </div>
        ) : (
          <form className="space-y-4" onSubmit={event => {
            event.preventDefault();
            if (submitting.current) return;
            const pay = form.timelonn.trim().replace(",", ".");
            if (!/^\d+(?:\.\d{1,2})?$/.test(pay) || Number(pay) > 99999999.99) {
              setFailure({ message: "Timelønn må være et positivt beløp eller 0, med maks to desimaler." });
              return;
            }
            if (new TextEncoder().encode(form.password).length > 72) {
              setFailure({ message: "Passordet er for langt. Bruk maks 72 byte, eller lag et sterkt passord med knappen." });
              return;
            }
            submitting.current = true;
            setFailure(null);
            create.mutate();
          }}>
            <fieldset disabled={create.isPending} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="create-employee-name">Fullt navn</Label>
                <Input id="create-employee-name" value={form.name} onChange={e => update("name", e.target.value)} required maxLength={200} autoComplete="off" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="create-employee-email">E-post</Label>
                  <Input id="create-employee-email" type="email" value={form.email} onChange={e => update("email", e.target.value)} required autoComplete="off" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="create-employee-phone">Telefon</Label>
                  <Input id="create-employee-phone" type="tel" value={form.phone} onChange={e => update("phone", e.target.value)} autoComplete="off" />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="create-employee-address">Adresse</Label>
                <Input id="create-employee-address" value={form.address} onChange={e => update("address", e.target.value)} autoComplete="off" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="create-employee-region">Region</Label>
                  <Input id="create-employee-region" value={form.region} onChange={e => update("region", e.target.value)} required placeholder="Kristiansand" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="create-employee-position">Stilling</Label>
                  <Input id="create-employee-position" value={form.stilling} onChange={e => update("stilling", e.target.value)} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="create-employee-number">Ansattnummer</Label>
                  <Input id="create-employee-number" type="number" min="1" max="2147483647" step="1" value={form.externalId} onChange={e => update("externalId", e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="create-employee-pay">Timelønn (kr)</Label>
                  <Input id="create-employee-pay" inputMode="decimal" value={form.timelonn} onChange={e => update("timelonn", e.target.value)} required placeholder="200,00" />
                </div>
              </div>
              {passwordField}
              {failure && (
                <div role="alert" className="rounded-md border border-destructive p-3 text-sm space-y-2">
                  <p>{failure.message}</p>
                  {failure.existingUsers?.map(user => (
                    <div key={user.id} className="space-y-1">
                      <p>{user.name} · {user.externalId ?? "Uten ansattnummer"} · {user.email}</p>
                      <Button type="button" variant="outline" size="sm" onClick={() => { onClose(); onSelectEmployee(user.id); }}>Vis eksisterende ansatt</Button>
                    </div>
                  ))}
                </div>
              )}
              <p className="text-xs text-muted-foreground">Opprettes med rollen ansatt, status Aktiv og vanlig onboarding.</p>
              <Button className="w-full" type="submit" data-testid="confirm-create-employee" disabled={create.isPending}>
                {create.isPending ? "Oppretter …" : "Opprett ansatt"}
              </Button>
            </fieldset>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}