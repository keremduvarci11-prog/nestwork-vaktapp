import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Mail, MailOpen, AlertCircle, Reply, CheckCircle2 } from "lucide-react";
import type { Melding, User } from "@shared/schema";

export default function AdminMeldinger() {
  const { toast } = useToast();
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");

  const { data: meldinger, isLoading } = useQuery<Melding[]>({
    queryKey: ["/api/meldinger"],
  });
  const { data: users } = useQuery<User[]>({
    queryKey: ["/api/users"],
  });

  const userMap = new Map(users?.map((u) => [u.id, u]) || []);

  const markRead = useMutation({
    mutationFn: (id: string) => apiRequest("PATCH", `/api/meldinger/${id}/read`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/meldinger"] });
    },
  });

  const sendReply = useMutation({
    mutationFn: ({ id, reply }: { id: string; reply: string }) =>
      apiRequest("PATCH", `/api/meldinger/${id}/reply`, { reply }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/meldinger"] });
      setReplyingTo(null);
      setReplyText("");
      toast({ title: "Svar sendt", description: "Svaret er synlig for den ansatte." });
    },
  });

  const handleReply = (id: string) => {
    if (!replyText.trim()) return;
    sendReply.mutate({ id, reply: replyText });
  };

  const unreadCount = meldinger?.filter((m) => !m.read).length || 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold" data-testid="text-admin-meldinger-title">Meldinger</h1>
        <p className="text-sm text-muted-foreground mt-1">{unreadCount} uleste meldinger</p>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-24 w-full rounded-md" />)}
        </div>
      ) : !meldinger?.length ? (
        <Card>
          <CardContent className="py-12 text-center">
            <AlertCircle className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
            <p className="font-medium">Ingen meldinger</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {meldinger.map((m) => {
            const sender = userMap.get(m.fromUserId);
            const isReplying = replyingTo === m.id;
            return (
              <Card key={m.id} className={!m.read ? "border-primary/30" : ""}>
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5">
                      {m.read ? (
                        <MailOpen className="w-4 h-4 text-muted-foreground" />
                      ) : (
                        <Mail className="w-4 h-4 text-primary" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <div>
                          <p className="text-sm font-semibold" data-testid={`text-sender-${m.id}`}>{sender?.name || "Ukjent"}</p>
                          <p className="text-xs text-muted-foreground">{sender?.stilling} - {sender?.region}</p>
                        </div>
                        {m.createdAt && (
                          <p className="text-xs text-muted-foreground flex-shrink-0">
                            {new Date(m.createdAt).toLocaleDateString("nb-NO", { day: "numeric", month: "short" })}
                          </p>
                        )}
                      </div>
                      <p className="text-sm font-medium mt-2">{m.subject}</p>
                      <p className="text-sm text-muted-foreground mt-1">{m.message}</p>

                      {m.reply && (
                        <div className="mt-3 p-3 rounded-md bg-primary/5 border border-primary/10">
                          <div className="flex items-center gap-1.5 mb-1">
                            <CheckCircle2 className="w-3 h-3 text-primary" />
                            <span className="text-xs font-medium text-primary">Ditt svar</span>
                            {m.repliedAt && (
                              <span className="text-xs text-muted-foreground ml-auto">
                                {new Date(m.repliedAt).toLocaleDateString("nb-NO", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                              </span>
                            )}
                          </div>
                          <p className="text-sm">{m.reply}</p>
                        </div>
                      )}

                      <div className="flex gap-2 mt-3">
                        {!m.read && !isReplying && (
                          <Button
                            data-testid={`button-mark-read-${m.id}`}
                            variant="secondary"
                            size="sm"
                            onClick={() => markRead.mutate(m.id)}
                          >
                            Merk som lest
                          </Button>
                        )}
                        {!isReplying && (
                          <Button
                            data-testid={`button-reply-${m.id}`}
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setReplyingTo(m.id);
                              setReplyText(m.reply || "");
                            }}
                          >
                            <Reply className="w-3.5 h-3.5 mr-1.5" />
                            {m.reply ? "Endre svar" : "Svar"}
                          </Button>
                        )}
                      </div>

                      {isReplying && (
                        <div className="mt-3 space-y-2">
                          <Textarea
                            data-testid={`input-reply-${m.id}`}
                            placeholder="Skriv ditt svar..."
                            value={replyText}
                            onChange={(e) => setReplyText(e.target.value)}
                            rows={3}
                          />
                          <div className="flex gap-2">
                            <Button
                              data-testid={`button-send-reply-${m.id}`}
                              size="sm"
                              onClick={() => handleReply(m.id)}
                              disabled={sendReply.isPending || !replyText.trim()}
                            >
                              Send svar
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setReplyingTo(null);
                                setReplyText("");
                              }}
                            >
                              Avbryt
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
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
