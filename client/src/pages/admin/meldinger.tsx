import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Mail, MailOpen, AlertCircle } from "lucide-react";
import type { Melding, User } from "@shared/schema";

export default function AdminMeldinger() {
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

  const unreadCount = meldinger?.filter((m) => !m.read).length || 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">Meldinger</h1>
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
                          <p className="text-sm font-semibold">{sender?.name || "Ukjent"}</p>
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
                      {!m.read && (
                        <Button
                          data-testid={`button-mark-read-${m.id}`}
                          variant="secondary"
                          size="sm"
                          className="mt-3"
                          onClick={() => markRead.mutate(m.id)}
                        >
                          Merk som lest
                        </Button>
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
