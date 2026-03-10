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
import { Send, MessageSquare, AlertCircle, Lock, ArrowLeft, Plus, Trash2 } from "lucide-react";
import type { Melding, SamtaleMelding } from "@shared/schema";

function SamtaleView({
  melding,
  userId,
  userName,
  onBack,
}: {
  melding: Melding;
  userId: string;
  userName: string;
  onBack: () => void;
}) {
  const [replyText, setReplyText] = useState("");

  const { data: samtale, isLoading } = useQuery<SamtaleMelding[]>({
    queryKey: ["/api/meldinger", melding.id, "samtale"],
  });

  const markSeen = useMutation({
    mutationFn: () => apiRequest("PATCH", `/api/meldinger/${melding.id}/seen-user`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/meldinger/user"] });
    },
  });

  if (!markSeen.isSuccess && !markSeen.isPending) {
    markSeen.mutate();
  }

  const sendReply = useMutation({
    mutationFn: (message: string) =>
      apiRequest("POST", `/api/meldinger/${melding.id}/samtale`, {
        message,
        fromUserId: userId,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/meldinger", melding.id, "samtale"] });
      queryClient.invalidateQueries({ queryKey: ["/api/meldinger/user"] });
      setReplyText("");
    },
  });

  const handleSend = () => {
    if (!replyText.trim()) return;
    sendReply.mutate(replyText);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onBack} data-testid="button-back-samtale">
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <h2 className="text-sm font-bold truncate">{melding.subject}</h2>
          {melding.closed && (
            <p className="text-xs text-muted-foreground">Avsluttet</p>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <div className={`flex ${melding.fromUserId === userId ? "justify-end" : "justify-start"}`}>
          <div className={`max-w-[85%] rounded-lg p-3 ${melding.fromUserId === userId ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
            {melding.fromUserId !== userId && (
              <p className="text-xs font-medium text-muted-foreground mb-1">Nestwork</p>
            )}
            <p className="text-sm">{melding.message}</p>
            {melding.createdAt && (
              <p className={`text-[10px] mt-1 ${melding.fromUserId === userId ? "text-primary-foreground/50" : "text-muted-foreground"}`}>
                {new Date(melding.createdAt).toLocaleDateString("nb-NO", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
              </p>
            )}
          </div>
        </div>

        {isLoading ? (
          <Skeleton className="h-16 w-3/4" />
        ) : (
          samtale?.map((msg) => {
            const isMine = msg.fromUserId === userId;
            return (
              <div key={msg.id} className={`flex ${isMine ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[85%] rounded-lg p-3 ${isMine ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                  <p className={`text-xs font-medium mb-1 ${isMine ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                    {isMine ? "Deg" : "Nestwork"}
                  </p>
                  <p className="text-sm">{msg.message}</p>
                  {msg.createdAt && (
                    <p className={`text-[10px] mt-1 ${isMine ? "text-primary-foreground/50" : "text-muted-foreground"}`}>
                      {new Date(msg.createdAt).toLocaleDateString("nb-NO", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                    </p>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {melding.closed ? (
        <div className="flex items-center justify-center gap-2 p-3 rounded-md bg-muted text-muted-foreground">
          <Lock className="w-4 h-4" />
          <span className="text-sm">Samtalen er avsluttet</span>
        </div>
      ) : (
        <div className="flex gap-2">
          <Textarea
            data-testid="input-samtale-reply"
            placeholder="Skriv melding..."
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            rows={2}
            className="flex-1"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
          />
          <Button
            data-testid="button-send-samtale"
            onClick={handleSend}
            disabled={sendReply.isPending || !replyText.trim()}
            className="self-end"
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
      )}
    </div>
  );
}

export default function Meldinger() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [showNewForm, setShowNewForm] = useState(false);
  const [openMeldingId, setOpenMeldingId] = useState<string | null>(null);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");

  const { data: rawMeldinger, isLoading } = useQuery<Melding[]>({
    queryKey: ["/api/meldinger/user", user?.id],
  });

  const meldinger = rawMeldinger?.filter((m) => !m.hiddenByUser) || [];

  const hideMelding = useMutation({
    mutationFn: (id: string) => apiRequest("PATCH", `/api/meldinger/${id}/hide-user`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/meldinger/user"] });
      toast({ title: "Samtale slettet" });
    },
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
      setShowNewForm(false);
      toast({ title: "Melding sendt!", description: "Du vil se svaret her." });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!subject.trim() || !message.trim()) return;
    sendMelding.mutate();
  };

  const openMelding = meldinger?.find((m) => m.id === openMeldingId);

  if (openMelding && user) {
    return (
      <SamtaleView
        melding={openMelding}
        userId={user.id}
        userName={user.name}
        onBack={() => setOpenMeldingId(null)}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold" data-testid="text-meldinger-title">Meldinger</h1>
          <p className="text-sm text-muted-foreground mt-1">Kontakt ledelsen</p>
        </div>
        {!showNewForm && (
          <Button size="sm" onClick={() => setShowNewForm(true)} data-testid="button-new-message">
            <Plus className="w-4 h-4 mr-1.5" />
            Ny melding
          </Button>
        )}
      </div>

      {showNewForm && (
        <Card className="border-primary/30">
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
              <div className="flex gap-2">
                <Button
                  data-testid="button-send-message"
                  type="submit"
                  className="flex-1"
                  disabled={sendMelding.isPending}
                >
                  <Send className="w-4 h-4 mr-2" />
                  SEND
                </Button>
                <Button
                  variant="ghost"
                  type="button"
                  onClick={() => {
                    setShowNewForm(false);
                    setSubject("");
                    setMessage("");
                  }}
                >
                  Avbryt
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <div>
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2].map((i) => <Skeleton key={i} className="h-20 w-full rounded-md" />)}
          </div>
        ) : !meldinger.length ? (
          <Card>
            <CardContent className="py-8 text-center">
              <AlertCircle className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">Ingen samtaler ennå</p>
              {!showNewForm && (
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3"
                  onClick={() => setShowNewForm(true)}
                  data-testid="button-start-conversation"
                >
                  Start en samtale
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {meldinger.map((m) => (
              <Card
                key={m.id}
                className={`cursor-pointer hover-elevate ${m.closed ? "opacity-60" : ""}`}
                data-testid={`card-samtale-${m.id}`}
              >
                <CardContent className="p-3">
                  <div className="flex items-start justify-between gap-2" onClick={() => setOpenMeldingId(m.id)}>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{m.subject}</p>
                      <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">{m.message}</p>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {m.closed ? (
                        <Lock className="w-3.5 h-3.5 text-muted-foreground" />
                      ) : m.reply ? (
                        <span className="text-xs text-primary font-medium">Ny svar</span>
                      ) : m.read ? (
                        <span className="text-xs text-green-600 dark:text-green-400">Lest</span>
                      ) : (
                        <span className="text-xs text-muted-foreground">Sendt</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center justify-between mt-1.5">
                    {m.createdAt && (
                      <p className="text-xs text-muted-foreground">
                        {new Date(m.createdAt).toLocaleDateString("nb-NO", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                      </p>
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (confirm("Vil du slette denne samtalen?")) {
                          hideMelding.mutate(m.id);
                        }
                      }}
                      className="text-muted-foreground hover:text-red-500 p-1"
                      data-testid={`button-hide-samtale-${m.id}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
