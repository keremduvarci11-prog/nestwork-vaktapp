import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Mail, MailOpen, AlertCircle, Send, Lock, ArrowLeft, User } from "lucide-react";
import type { Melding, User as UserType, SamtaleMelding } from "@shared/schema";

function SamtaleView({
  melding,
  sender,
  onBack,
}: {
  melding: Melding;
  sender: UserType | undefined;
  onBack: () => void;
}) {
  const { toast } = useToast();
  const [replyText, setReplyText] = useState("");

  const { data: samtale, isLoading } = useQuery<SamtaleMelding[]>({
    queryKey: ["/api/meldinger", melding.id, "samtale"],
  });

  const sendReply = useMutation({
    mutationFn: (message: string) =>
      apiRequest("POST", `/api/meldinger/${melding.id}/samtale`, {
        message,
        fromUserId: "admin",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/meldinger", melding.id, "samtale"] });
      queryClient.invalidateQueries({ queryKey: ["/api/meldinger"] });
      setReplyText("");
    },
  });

  const closeSamtale = useMutation({
    mutationFn: () => apiRequest("PATCH", `/api/meldinger/${melding.id}/close`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/meldinger"] });
      toast({ title: "Samtale avsluttet" });
      onBack();
    },
  });

  const markSeen = useMutation({
    mutationFn: () => apiRequest("PATCH", `/api/meldinger/${melding.id}/seen-admin`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/meldinger"] });
    },
  });

  if (!markSeen.isSuccess && !markSeen.isPending) {
    markSeen.mutate();
  }

  const handleSend = () => {
    if (!replyText.trim()) return;
    sendReply.mutate(replyText);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onBack} data-testid="button-back-meldinger">
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <h2 className="text-sm font-bold truncate">{melding.subject}</h2>
          <p className="text-xs text-muted-foreground">{sender?.name} - {sender?.region}</p>
        </div>
        {!melding.closed && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => closeSamtale.mutate()}
            data-testid="button-close-samtale"
            className="text-destructive border-destructive/30"
          >
            <Lock className="w-3.5 h-3.5 mr-1.5" />
            Avslutt
          </Button>
        )}
      </div>

      <div className="space-y-2">
        <div className="flex justify-start">
          <div className="max-w-[85%] rounded-lg p-3 bg-muted">
            <p className="text-xs font-medium text-muted-foreground mb-1">{sender?.name}</p>
            <p className="text-sm">{melding.message}</p>
            {melding.createdAt && (
              <p className="text-[10px] text-muted-foreground mt-1">
                {new Date(melding.createdAt).toLocaleDateString("nb-NO", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
              </p>
            )}
          </div>
        </div>

        {isLoading ? (
          <Skeleton className="h-16 w-3/4" />
        ) : (
          samtale?.map((msg) => {
            const isAdmin = msg.fromUserId === "admin";
            return (
              <div key={msg.id} className={`flex ${isAdmin ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[85%] rounded-lg p-3 ${isAdmin ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                  <p className={`text-xs font-medium mb-1 ${isAdmin ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                    {isAdmin ? "Nestwork" : sender?.name}
                  </p>
                  <p className="text-sm">{msg.message}</p>
                  {msg.createdAt && (
                    <p className={`text-[10px] mt-1 ${isAdmin ? "text-primary-foreground/50" : "text-muted-foreground"}`}>
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
            data-testid="input-admin-reply"
            placeholder="Skriv svar..."
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
            data-testid="button-send-reply"
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

export default function AdminMeldinger() {
  const [openMeldingId, setOpenMeldingId] = useState<string | null>(null);

  const { data: meldinger, isLoading } = useQuery<Melding[]>({
    queryKey: ["/api/meldinger"],
  });
  const { data: users } = useQuery<UserType[]>({
    queryKey: ["/api/users"],
  });

  const userMap = new Map(users?.map((u) => [u.id, u]) || []);

  const unreadCount = meldinger?.filter((m) => !m.read).length || 0;
  const openMelding = meldinger?.find((m) => m.id === openMeldingId);

  if (openMelding) {
    return (
      <SamtaleView
        melding={openMelding}
        sender={userMap.get(openMelding.fromUserId)}
        onBack={() => setOpenMeldingId(null)}
      />
    );
  }

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
            return (
              <Card
                key={m.id}
                className={`cursor-pointer hover-elevate ${!m.read ? "border-primary/30" : ""} ${m.closed ? "opacity-60" : ""}`}
                onClick={() => setOpenMeldingId(m.id)}
                data-testid={`card-melding-${m.id}`}
              >
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5">
                      {m.closed ? (
                        <Lock className="w-4 h-4 text-muted-foreground" />
                      ) : m.read ? (
                        <MailOpen className="w-4 h-4 text-muted-foreground" />
                      ) : (
                        <Mail className="w-4 h-4 text-primary" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-semibold">{sender?.name || "Ukjent"}</p>
                          <p className="text-xs text-muted-foreground">{sender?.region}</p>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          {m.createdAt && (
                            <p className="text-xs text-muted-foreground">
                              {new Date(m.createdAt).toLocaleDateString("nb-NO", { day: "numeric", month: "short" })}
                            </p>
                          )}
                          {m.closed && (
                            <span className="text-[10px] text-muted-foreground">Avsluttet</span>
                          )}
                        </div>
                      </div>
                      <p className="text-sm font-medium mt-1">{m.subject}</p>
                      <p className="text-sm text-muted-foreground line-clamp-1 mt-0.5">{m.message}</p>
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
