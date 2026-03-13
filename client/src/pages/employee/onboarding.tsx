import { useState, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Upload,
  KeyRound,
  Camera,
  FileText,
  ShieldCheck,
  FileSignature,
  Loader2,
  Check,
} from "lucide-react";
import type { Onboarding as OnboardingType } from "@shared/schema";

const itemConfig: Record<string, { icon: typeof KeyRound; description: string; actionType: "navigate" | "upload" | "checkbox" }> = {
  "Bytt passord": {
    icon: KeyRound,
    description: "Du må bytte til et personlig passord. Gå til Innstillinger for å endre.",
    actionType: "navigate",
  },
  "Last opp profilbilde": {
    icon: Camera,
    description: "Last opp et profilbilde slik at kollegaer kan kjenne deg igjen.",
    actionType: "navigate",
  },
  "Last opp CV": {
    icon: FileText,
    description: "Last opp din CV (PDF, Word eller bilde). Maks 10 MB.",
    actionType: "upload",
  },
  "Last opp politiattest": {
    icon: ShieldCheck,
    description: "Last opp gyldig politiattest (PDF, Word eller bilde). Maks 10 MB.",
    actionType: "upload",
  },
  "Signert kontrakt": {
    icon: FileSignature,
    description: "Bekreft at du har signert arbeidskontrakt med Nestwork.",
    actionType: "checkbox",
  },
};

const desiredOrder = [
  "Bytt passord",
  "Last opp profilbilde",
  "Last opp CV",
  "Last opp politiattest",
  "Signert kontrakt",
];

export default function OnboardingPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [expandedId, setExpandedId] = useState<string | null>(null);

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

  const sortedItems = items?.slice().sort((a, b) => {
    const ai = desiredOrder.indexOf(a.item);
    const bi = desiredOrder.indexOf(b.item);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });

  const completed = items?.filter((i) => i.completed).length || 0;
  const total = items?.length || 0;
  const progress = total > 0 ? (completed / total) * 100 : 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">Kom i gang</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Fullfør alle stegene nedenfor for å bli klar som vikar
        </p>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-14 w-full rounded-md" />
          ))}
        </div>
      ) : (
        <>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-medium">Fremgang</p>
                <p className="text-sm text-muted-foreground">
                  {completed}/{total}
                </p>
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
            {sortedItems?.map((item) => (
              <OnboardingItem
                key={item.id}
                item={item}
                user={user!}
                expanded={expandedId === item.id}
                onToggleExpand={() =>
                  setExpandedId(expandedId === item.id ? null : item.id)
                }
                onComplete={(done) =>
                  toggleItem.mutate({ id: item.id, completed: done })
                }
                onNavigate={navigate}
                toast={toast}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function OnboardingItem({
  item,
  user,
  expanded,
  onToggleExpand,
  onComplete,
  onNavigate,
  toast,
}: {
  item: OnboardingType;
  user: { id: string; cvFile?: string | null; politiattestFile?: string | null };
  expanded: boolean;
  onToggleExpand: () => void;
  onComplete: (done: boolean) => void;
  onNavigate: (path: string) => void;
  toast: ReturnType<typeof useToast>["toast"];
}) {
  const config = itemConfig[item.item] || {
    icon: FileText,
    description: "",
    actionType: "checkbox" as const,
  };
  const Icon = config.icon;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const isUploadType = config.actionType === "upload";
  const uploadEndpoint =
    item.item === "Last opp CV"
      ? `/api/users/${user.id}/upload-cv`
      : `/api/users/${user.id}/upload-politiattest`;

  const existingFile =
    item.item === "Last opp CV" ? user.cvFile : item.item === "Last opp politiattest" ? user.politiattestFile : null;

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(uploadEndpoint, {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Opplasting feilet");
      }
      toast({ title: "Fil lastet opp" });
      onComplete(true);
      queryClient.invalidateQueries({ queryKey: ["/api/user"] });
    } catch (err: any) {
      toast({
        title: "Feil",
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <Card
      className={item.completed ? "opacity-70 border-green-200 dark:border-green-900" : ""}
      data-testid={`card-onboarding-${item.id}`}
    >
      <CardContent className="p-0">
        <button
          className="w-full p-4 flex items-center gap-3 text-left"
          onClick={onToggleExpand}
          data-testid={`button-expand-${item.id}`}
        >
          <div
            className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
              item.completed
                ? "bg-green-100 dark:bg-green-900 text-green-600 dark:text-green-400"
                : "bg-muted text-muted-foreground"
            }`}
          >
            {item.completed ? (
              <Check className="w-4 h-4" />
            ) : (
              <Icon className="w-4 h-4" />
            )}
          </div>
          <span
            className={`text-sm flex-1 ${
              item.completed
                ? "line-through text-muted-foreground"
                : "font-medium"
            }`}
          >
            {item.item}
          </span>
          {expanded ? (
            <ChevronUp className="w-4 h-4 text-muted-foreground flex-shrink-0" />
          ) : (
            <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" />
          )}
        </button>

        {expanded && (
          <div className="px-4 pb-4 pt-0 border-t">
            <p className="text-sm text-muted-foreground mt-3 mb-3">
              {config.description}
            </p>

            {isUploadType && (
              <div className="space-y-2">
                {existingFile && (
                  <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Fil lastet opp</span>
                  </div>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.webp"
                  className="hidden"
                  onChange={handleUpload}
                  data-testid={`input-upload-${item.id}`}
                />
                <Button
                  size="sm"
                  variant={existingFile ? "outline" : "default"}
                  disabled={uploading}
                  onClick={() => fileInputRef.current?.click()}
                  data-testid={`button-upload-${item.id}`}
                >
                  {uploading ? (
                    <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                  ) : (
                    <Upload className="w-4 h-4 mr-1.5" />
                  )}
                  {existingFile ? "Last opp ny fil" : "Velg fil"}
                </Button>
              </div>
            )}

            {config.actionType === "navigate" && (
              <div className="flex gap-2 flex-wrap">
                <Button
                  size="sm"
                  onClick={() => onNavigate("/innstillinger")}
                  data-testid={`button-goto-settings-${item.id}`}
                >
                  Gå til Innstillinger
                </Button>
                <Button
                  size="sm"
                  variant={item.completed ? "outline" : "secondary"}
                  onClick={() => onComplete(!item.completed)}
                  data-testid={`button-toggle-${item.id}`}
                >
                  {item.completed ? "Angre" : "Merk som fullført"}
                </Button>
              </div>
            )}

            {config.actionType === "checkbox" && (
              <Button
                size="sm"
                variant={item.completed ? "outline" : "default"}
                onClick={() => onComplete(!item.completed)}
                data-testid={`button-toggle-${item.id}`}
              >
                {item.completed ? "Angre" : "Merk som fullført"}
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
