import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { CheckCircle2 } from "lucide-react";
import type { Onboarding as OnboardingType } from "@shared/schema";

export default function OnboardingPage() {
  const { user } = useAuth();

  const { data: items, isLoading } = useQuery<OnboardingType[]>({
    queryKey: ["/api/onboarding", user?.id],
  });

  const toggleItem = useMutation({
    mutationFn: ({ id, completed }: { id: string; completed: boolean }) =>
      apiRequest("PATCH", `/api/onboarding/${id}`, { completed }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/onboarding"] });
    },
  });

  const completed = items?.filter((i) => i.completed).length || 0;
  const total = items?.length || 0;
  const progress = total > 0 ? (completed / total) * 100 : 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">Onboarding</h1>
        <p className="text-sm text-muted-foreground mt-1">Fullfør alle steg for å komme i gang</p>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-14 w-full rounded-md" />)}
        </div>
      ) : (
        <>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-medium">Fremgang</p>
                <p className="text-sm text-muted-foreground">{completed}/{total}</p>
              </div>
              <Progress value={progress} className="h-2" />
              {progress === 100 && (
                <div className="flex items-center gap-2 mt-3 text-green-600 dark:text-green-400">
                  <CheckCircle2 className="w-4 h-4" />
                  <p className="text-sm font-medium">Alt er fullført!</p>
                </div>
              )}
            </CardContent>
          </Card>

          <div className="space-y-2">
            {items?.map((item) => (
              <Card key={item.id} className={item.completed ? "opacity-70" : ""}>
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <Checkbox
                      data-testid={`checkbox-onboarding-${item.id}`}
                      checked={item.completed ?? false}
                      onCheckedChange={(checked) =>
                        toggleItem.mutate({ id: item.id, completed: checked as boolean })
                      }
                    />
                    <span className={`text-sm ${item.completed ? "line-through text-muted-foreground" : "font-medium"}`}>
                      {item.item}
                    </span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
