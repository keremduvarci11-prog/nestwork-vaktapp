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
import { Send, MessageSquare, AlertCircle, CheckCircle2 } from "lucide-react";
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
      toast({ title: "Melding sendt!", description: "Du vil se svaret her." });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!subject.trim() || !message.trim()) return;
    sendMelding.mutate();
  };

  const hasNewReplies = meldinger?.some((m) => m.reply) || false;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold" data-testid="text-meldinger-title">Meldinger</h1>
        <p className="text-sm text-muted-foreground mt-1">Send melding til ledelsen</p>
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <MessageSquare className="w-4 h-4 text-primary" />
            <h2 className="text-sm font-semibold">Ny melding</h2>
          </div>
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
        <h2 className="text-sm font-semibold mb-3">Mine meldinger</h2>
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
              <Card key={m.id} className={m.reply ? "border-primary/30" : ""}>
                <CardContent className="p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{m.subject}</p>
                      <p className="text-xs text-muted-foreground line-clamp-2 mt-1">{m.message}</p>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {m.reply ? (
                        <span className="text-xs text-primary font-medium">Besvart</span>
                      ) : m.read ? (
                        <span className="text-xs text-green-600 dark:text-green-400">Lest</span>
                      ) : (
                        <span className="text-xs text-muted-foreground">Sendt</span>
                      )}
                    </div>
                  </div>

                  {m.reply && (
                    <div className="mt-3 p-3 rounded-md bg-primary/5 border border-primary/10">
                      <div className="flex items-center gap-1.5 mb-1">
                        <CheckCircle2 className="w-3 h-3 text-primary" />
                        <span className="text-xs font-medium text-primary">Svar fra Nestwork</span>
                        {m.repliedAt && (
                          <span className="text-xs text-muted-foreground ml-auto">
                            {new Date(m.repliedAt).toLocaleDateString("nb-NO", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                          </span>
                        )}
                      </div>
                      <p className="text-sm">{m.reply}</p>
                    </div>
                  )}

                  {m.createdAt && (
                    <p className="text-xs text-muted-foreground mt-2">
                      Sendt {new Date(m.createdAt).toLocaleDateString("nb-NO", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
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
