import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Mail, MailOpen, AlertCircle, Send, Lock, ArrowLeft, User, Trash2, RotateCcw, Plus, Search, ChevronDown } from "lucide-react";
import type { Melding, User as UserType, SamtaleMelding } from "@shared/schema";

function isAdminMessage(fromUserId: string, adminIds: Set<string>) {
  return fromUserId === "admin" || adminIds.has(fromUserId);
}

function SamtaleView({
  melding,
  sender,
  adminIds,
  onBack,
}: {
  melding: Melding;
  sender: UserType | undefined;
  adminIds: Set<string>;
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

  const reopenSamtale = useMutation({
    mutationFn: () => apiRequest("PATCH", `/api/meldinger/${melding.id}/reopen`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/meldinger"] });
      toast({ title: "Samtale gjenåpnet" });
      onBack();
    },
  });

  const deleteSamtale = useMutation({
    mutationFn: () => apiRequest("DELETE", `/api/meldinger/${melding.id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/meldinger"] });
      toast({ title: "Samtale slettet" });
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
          <p className="text-xs text-muted-foreground">{sender ? `${sender.name} - ${sender.region}` : "Sendt av Nestwork"}</p>
        </div>
        <div className="flex gap-1">
          {melding.closed ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => reopenSamtale.mutate()}
              data-testid="button-reopen-samtale"
            >
              <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
              Gjenåpne
            </Button>
          ) : (
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
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              if (confirm("Vil du slette denne samtalen permanent?")) {
                deleteSamtale.mutate();
              }
            }}
            data-testid="button-delete-samtale"
          >
            <Trash2 className="w-3.5 h-3.5 text-red-500" />
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        <div className={`flex ${isAdminMessage(melding.fromUserId, adminIds) ? "justify-end" : "justify-start"}`}>
          <div className={`max-w-[85%] rounded-lg p-3 ${isAdminMessage(melding.fromUserId, adminIds) ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
            <p className={`text-xs font-medium mb-1 ${isAdminMessage(melding.fromUserId, adminIds) ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
              {isAdminMessage(melding.fromUserId, adminIds) ? "Deg" : sender?.name}
            </p>
            <p className="text-sm">{melding.message}</p>
            {melding.createdAt && (
              <p className={`text-[10px] mt-1 ${isAdminMessage(melding.fromUserId, adminIds) ? "text-primary-foreground/50" : "text-muted-foreground"}`}>
                {new Date(melding.createdAt).toLocaleDateString("nb-NO", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
              </p>
            )}
          </div>
        </div>

        {isLoading ? (
          <Skeleton className="h-16 w-3/4" />
        ) : (
          samtale?.map((msg) => {
            const isSentByAdmin = isAdminMessage(msg.fromUserId, adminIds);
            return (
              <div key={msg.id} className={`flex ${isSentByAdmin ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[85%] rounded-lg p-3 ${isSentByAdmin ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                  <p className={`text-xs font-medium mb-1 ${isSentByAdmin ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                    {isSentByAdmin ? "Deg" : sender?.name}
                  </p>
                  <p className="text-sm">{msg.message}</p>
                  {msg.createdAt && (
                    <p className={`text-[10px] mt-1 ${isSentByAdmin ? "text-primary-foreground/50" : "text-muted-foreground"}`}>
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

function NyMeldingView({
  users,
  onBack,
}: {
  users: UserType[];
  onBack: () => void;
}) {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [selectedUser, setSelectedUser] = useState<UserType | null>(null);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);

  const ansatte = users.filter((u) => u.role === "ansatt");
  const filtered = search
    ? ansatte.filter((u) =>
        u.name.toLowerCase().includes(search.toLowerCase()) ||
        u.region.toLowerCase().includes(search.toLowerCase())
      )
    : ansatte;

  const sendMelding = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/meldinger", {
        toUserId: selectedUser!.id,
        subject,
        message,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/meldinger"] });
      toast({ title: "Melding sendt" });
      onBack();
    },
    onError: () => {
      toast({ title: "Kunne ikke sende melding", variant: "destructive" });
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onBack} data-testid="button-back-ny-melding">
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <h2 className="text-lg font-bold">Ny melding</h2>
      </div>

      <div className="space-y-3">
        <div className="relative">
          <label className="text-sm font-medium mb-1.5 block">Velg mottaker</label>
          {selectedUser ? (
            <div
              className="flex items-center justify-between p-3 rounded-md border cursor-pointer"
              onClick={() => { setSelectedUser(null); setShowDropdown(true); }}
              data-testid="selected-user-display"
            >
              <div className="flex items-center gap-2">
                <User className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm font-medium">{selectedUser.name}</span>
                <span className="text-xs text-muted-foreground">{selectedUser.region}</span>
              </div>
              <ChevronDown className="w-4 h-4 text-muted-foreground" />
            </div>
          ) : (
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                data-testid="input-search-ansatt"
                placeholder="Søk etter ansatt..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setShowDropdown(true); }}
                onFocus={() => setShowDropdown(true)}
                className="pl-9"
              />
            </div>
          )}
          {showDropdown && !selectedUser && (
            <div className="absolute z-10 w-full mt-1 bg-background border rounded-md shadow-lg max-h-48 overflow-y-auto">
              {filtered.length === 0 ? (
                <div className="p-3 text-sm text-muted-foreground text-center">Ingen ansatte funnet</div>
              ) : (
                filtered.map((u) => (
                  <button
                    key={u.id}
                    data-testid={`select-ansatt-${u.id}`}
                    className="w-full flex items-center gap-2 p-3 text-left hover:bg-muted transition-colors"
                    onClick={() => { setSelectedUser(u); setShowDropdown(false); setSearch(""); }}
                  >
                    <User className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm font-medium">{u.name}</span>
                    <span className="text-xs text-muted-foreground ml-auto">{u.region}</span>
                  </button>
                ))
              )}
            </div>
          )}
        </div>

        <div>
          <label className="text-sm font-medium mb-1.5 block">Emne</label>
          <Input
            data-testid="input-ny-melding-subject"
            placeholder="Skriv emne..."
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
          />
        </div>

        <div>
          <label className="text-sm font-medium mb-1.5 block">Melding</label>
          <Textarea
            data-testid="input-ny-melding-body"
            placeholder="Skriv melding..."
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={4}
          />
        </div>

        <Button
          data-testid="button-send-ny-melding"
          onClick={() => sendMelding.mutate()}
          disabled={!selectedUser || !subject.trim() || !message.trim() || sendMelding.isPending}
          className="w-full"
        >
          <Send className="w-4 h-4 mr-2" />
          Send melding
        </Button>
      </div>
    </div>
  );
}

export default function AdminMeldinger() {
  const { user: currentAdmin } = useAuth();
  const [openMeldingId, setOpenMeldingId] = useState<string | null>(null);
  const [showNyMelding, setShowNyMelding] = useState(false);

  const { data: meldinger, isLoading } = useQuery<Melding[]>({
    queryKey: ["/api/meldinger"],
  });
  const { data: users } = useQuery<UserType[]>({
    queryKey: ["/api/users"],
  });

  const userMap = new Map(users?.map((u) => [u.id, u]) || []);
  const adminIds = new Set(
    users?.filter((u) => u.role === "admin").map((u) => u.id) || []
  );

  const myMeldinger = meldinger?.filter((m) => {
    if (m.toUserId === currentAdmin?.id || m.fromUserId === currentAdmin?.id) return true;
    if (m.fromUserId === "admin") return true;
    if (!m.toUserId && !adminIds.has(m.fromUserId) && m.fromUserId !== "admin") return true;
    return false;
  }) || [];

  const unreadCount = myMeldinger.filter((m) => !m.read).length || 0;
  const openMelding = myMeldinger.find((m) => m.id === openMeldingId);

  if (showNyMelding && users) {
    return (
      <NyMeldingView
        users={users}
        onBack={() => setShowNyMelding(false)}
      />
    );
  }

  if (openMelding) {
    const fromAdmin = isAdminMessage(openMelding.fromUserId, adminIds);
    const otherUser = fromAdmin
      ? userMap.get(openMelding.toUserId || "")
      : userMap.get(openMelding.fromUserId);
    return (
      <SamtaleView
        melding={openMelding}
        sender={otherUser}
        adminIds={adminIds}
        onBack={() => setOpenMeldingId(null)}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold" data-testid="text-admin-meldinger-title">Meldinger</h1>
          <p className="text-sm text-muted-foreground mt-1">{unreadCount} uleste meldinger</p>
        </div>
        <Button
          onClick={() => setShowNyMelding(true)}
          data-testid="button-ny-melding-admin"
          size="sm"
        >
          <Plus className="w-4 h-4 mr-1.5" />
          Ny melding
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-24 w-full rounded-md" />)}
        </div>
      ) : !myMeldinger.length ? (
        <Card>
          <CardContent className="py-12 text-center">
            <AlertCircle className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
            <p className="font-medium">Ingen meldinger</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {myMeldinger.map((m) => {
            const fromAdmin = isAdminMessage(m.fromUserId, adminIds);
            const otherUser = fromAdmin ? userMap.get(m.toUserId || "") : userMap.get(m.fromUserId);
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
                          <p className="text-sm font-semibold">
                            {fromAdmin && <span className="text-xs text-muted-foreground mr-1">Til:</span>}
                            {otherUser?.name || "Ukjent"}
                          </p>
                          <p className="text-xs text-muted-foreground">{otherUser?.region}</p>
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
