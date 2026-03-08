import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Plus } from "lucide-react";
import type { Barnehage } from "@shared/schema";

export default function NyVakt() {
  const { toast } = useToast();
  const [barnehageId, setBarnehageId] = useState("");
  const [dato, setDato] = useState("");
  const [startTid, setStartTid] = useState("07:30");
  const [sluttTid, setSluttTid] = useState("15:30");
  const [vikarkode, setVikarkode] = useState("");
  const [beskrivelse, setBeskrivelse] = useState("");

  const { data: barnehager } = useQuery<Barnehage[]>({
    queryKey: ["/api/barnehager"],
  });

  const selectedBh = barnehager?.find((b) => b.id === barnehageId);

  const createVakt = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/vakter", {
        barnehageId,
        dato,
        startTid,
        sluttTid,
        vikarkode,
        status: "ledig",
        region: selectedBh?.region || "",
        beskrivelse,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/vakter"] });
      toast({ title: "Vakt opprettet!", description: "Ansatte i regionen kan nå se vakten." });
      setBarnehageId("");
      setDato("");
      setVikarkode("");
      setBeskrivelse("");
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
                </SelectContent>
              </Select>
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
              OPPRETT VAKT
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
