import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Bell, Calendar, MessageSquare, UserCheck, Clock, CheckCheck } from "lucide-react";
import { useLocation } from "wouter";
import type { Varsel } from "@shared/schema";

const typeIcons: Record<string, typeof Bell> = {
  vakt: Calendar,
  tildeling: UserCheck,
  melding: MessageSquare,
  reminder: Clock,
  info: Bell,
};

const typeColors: Record<string, string> = {
  vakt: "text-blue-500",
  tildeling: "text-purple-500",
  melding: "text-green-500",
  reminder: "text-amber-500",
  info: "text-muted-foreground",
};

export default function Varsler() {
  const { user } = useAuth();
  const [, navigate] = useLocation();

  const { data: varsler, isLoading } = useQuery<Varsel[]>({
    queryKey: ["/api/varsler"],
    refetchInterval: 15000,
  });

  const markRead = useMutation({
    mutationFn: (id: string) => apiRequest("PATCH", `/api/varsler/${id}/read`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/varsler"] });
      queryClient.invalidateQueries({ queryKey: ["/api/varsler/unread-count"] });
    },
  });

  const markAllRead = useMutation({
    mutationFn: () => apiRequest("PATCH", "/api/varsler/read-all"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/varsler"] });
      queryClient.invalidateQueries({ queryKey: ["/api/varsler/unread-count"] });
    },
  });

  const handleClick = (varsel: Varsel) => {
    if (!varsel.read) {
      markRead.mutate(varsel.id);
    }
    if (varsel.link) {
      navigate(varsel.link);
    }
  };

  const unreadCount = varsler?.filter((v) => !v.read).length || 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Varsler</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {unreadCount > 0 ? `${unreadCount} uleste varsler` : "Ingen uleste varsler"}
          </p>
        </div>
        {unreadCount > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => markAllRead.mutate()}
            disabled={markAllRead.isPending}
            data-testid="button-mark-all-read"
          >
            <CheckCheck className="w-3.5 h-3.5 mr-1" />
            Merk alle lest
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full rounded-md" />)}
        </div>
      ) : varsler && varsler.length > 0 ? (
        <div className="space-y-2">
          {varsler.map((v) => {
            const Icon = typeIcons[v.type] || Bell;
            const color = typeColors[v.type] || "text-muted-foreground";
            const time = v.createdAt ? new Date(v.createdAt).toLocaleString("nb-NO", {
              day: "numeric", month: "short", hour: "2-digit", minute: "2-digit"
            }) : "";
            return (
              <Card
                key={v.id}
                className={`cursor-pointer transition-colors ${!v.read ? "border-primary/30 bg-primary/5" : ""}`}
                onClick={() => handleClick(v)}
                data-testid={`varsel-${v.id}`}
              >
                <CardContent className="p-3 flex items-start gap-3">
                  <div className={`mt-0.5 ${color}`}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className={`text-sm ${!v.read ? "font-semibold" : "font-medium"}`}>{v.title}</p>
                      {!v.read && <span className="w-2 h-2 rounded-full bg-primary flex-shrink-0" />}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{v.message}</p>
                    <p className="text-[10px] text-muted-foreground mt-1">{time}</p>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card>
          <CardContent className="p-8 text-center">
            <Bell className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">Ingen varsler enna</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
