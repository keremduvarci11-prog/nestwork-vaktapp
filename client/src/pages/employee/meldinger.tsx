import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Send, MessageSquare, AlertCircle } from "lucide-react";
import type { Melding } from "@shared/schema";

export default function Meldinger() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");

  const { data: meldinger, isLoading } = useQuery<Melding[]>({
    queryKey: ["/api/meldinger/user", user?.id],
  });

  const sendMelding = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/meldinger", {
        fromUserId: user?.id,
        subject,
        message,
        read: false,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/meldinger/user"] });
      setSubject("");
      setMessage("");
      toast({ title: "Melding sendt!", description: "Admin vil svare deg snart." });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!subject.trim() || !message.trim()) return;
    sendMelding.mutate();
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">Meldinger</h1>
        <p className="text-sm text-muted-foreground mt-1">Kontakt ledelsen</p>
      </div>

      <Card>
        <CardContent className="p-4">
          <form onSubmit={handleSubmit} className="space-y-3">
            <Input
              data-testid="input-subject"
              placeholder="Emne"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              required
            />
            <Textarea
              data-testid="input-message"
              placeholder="Skriv din melding..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={4}
              required
            />
            <Button
              data-testid="button-send-message"
              type="submit"
              className="w-full"
              disabled={sendMelding.isPending}
            >
              <Send className="w-4 h-4 mr-2" />
              SEND MELDING
            </Button>
          </form>
        </CardContent>
      </Card>

      <div>
        <h2 className="text-sm font-semibold mb-3">Sendte meldinger</h2>
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2].map((i) => <Skeleton key={i} className="h-20 w-full rounded-md" />)}
          </div>
        ) : !meldinger?.length ? (
          <Card>
            <CardContent className="py-8 text-center">
              <AlertCircle className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">Ingen meldinger sendt ennå</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {meldinger.map((m) => (
              <Card key={m.id}>
                <CardContent className="p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{m.subject}</p>
                      <p className="text-xs text-muted-foreground line-clamp-2 mt-1">{m.message}</p>
                    </div>
                    <div className="flex items-center gap-1">
                      {m.read ? (
                        <span className="text-xs text-green-600 dark:text-green-400">Lest</span>
                      ) : (
                        <span className="text-xs text-muted-foreground">Ulest</span>
                      )}
                    </div>
                  </div>
                  {m.createdAt && (
                    <p className="text-xs text-muted-foreground mt-2">
                      {new Date(m.createdAt).toLocaleDateString("nb-NO", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                    </p>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
