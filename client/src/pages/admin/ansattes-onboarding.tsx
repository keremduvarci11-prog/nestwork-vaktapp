import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  ArrowLeft,
  Search,
  CheckCircle2,
  AlertTriangle,
  FileText,
  ShieldCheck,
  ChevronDown,
  ChevronUp,
  Download,
  Check,
  X,
} from "lucide-react";

interface OnboardingItem {
  id: string;
  item: string;
  completed: boolean;
  completedAt: string | null;
}

interface EmployeeOnboarding {
  userId: string;
  name: string;
  region: string;
  profileImage: string | null;
  cvFile: string | null;
  politiattestFile: string | null;
  progress: number;
  completedCount: number;
  totalCount: number;
  items: OnboardingItem[];
}

export default function AnsattesOnboarding() {
  const [, navigate] = useLocation();
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data: employees, isLoading } = useQuery<EmployeeOnboarding[]>({
    queryKey: ["/api/admin/onboarding-overview"],
  });

  const filtered = employees?.filter((e) => {
    const q = searchQuery.toLowerCase();
    return (
      e.name.toLowerCase().includes(q) ||
      e.userId.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button
          size="icon"
          variant="ghost"
          onClick={() => navigate("/profil")}
          data-testid="button-back"
        >
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <h1 className="text-xl font-bold">Ansattes onboarding</h1>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Søk etter ansatt (navn eller ID)"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9"
          data-testid="input-search-employee"
        />
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-20 w-full rounded-md" />
          ))}
        </div>
      ) : filtered && filtered.length > 0 ? (
        <div className="space-y-2">
          {filtered.map((emp) => {
            const isExpanded = expandedId === emp.userId;
            const initials = emp.name
              .split(" ")
              .map((n) => n[0])
              .join("")
              .toUpperCase();

            return (
              <Card key={emp.userId} data-testid={`card-employee-${emp.userId}`}>
                <CardContent className="p-0">
                  <button
                    className="w-full p-4 flex items-center gap-3 text-left"
                    onClick={() =>
                      setExpandedId(isExpanded ? null : emp.userId)
                    }
                    data-testid={`button-expand-employee-${emp.userId}`}
                  >
                    <Avatar className="w-10 h-10 flex-shrink-0">
                      {emp.profileImage && (
                        <AvatarImage src={emp.profileImage} alt={emp.name} />
                      )}
                      <AvatarFallback className="bg-primary text-primary-foreground text-sm font-bold">
                        {initials}
                      </AvatarFallback>
                    </Avatar>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium truncate" data-testid={`text-employee-name-${emp.userId}`}>
                          {emp.name}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {emp.region}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <Progress
                          value={emp.progress}
                          className="h-1.5 flex-1"
                        />
                        <span
                          className={`text-xs font-medium ${
                            emp.progress === 100
                              ? "text-green-600 dark:text-green-400"
                              : "text-muted-foreground"
                          }`}
                          data-testid={`text-progress-${emp.userId}`}
                        >
                          {emp.progress}%
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 flex-shrink-0">
                      {emp.progress === 100 ? (
                        <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400" />
                      ) : (
                        <AlertTriangle className="w-5 h-5 text-amber-500" />
                      )}
                      {isExpanded ? (
                        <ChevronUp className="w-4 h-4 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-muted-foreground" />
                      )}
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="px-4 pb-4 border-t">
                      <div className="mt-3 space-y-2">
                        {emp.items.map((item) => (
                          <div
                            key={item.id}
                            className="flex items-center gap-2 text-sm"
                            data-testid={`item-onboarding-${item.id}`}
                          >
                            {item.completed ? (
                              <Check className="w-4 h-4 text-green-600 dark:text-green-400 flex-shrink-0" />
                            ) : (
                              <X className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                            )}
                            <span
                              className={
                                item.completed
                                  ? "text-muted-foreground line-through"
                                  : "font-medium"
                              }
                            >
                              {item.item}
                            </span>
                          </div>
                        ))}
                      </div>

                      {(emp.cvFile || emp.politiattestFile) && (
                        <div className="mt-4 space-y-2">
                          <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
                            Dokumenter
                          </p>
                          {emp.cvFile && (
                            <a
                              href={emp.cvFile}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-2 text-sm text-primary hover:underline"
                              data-testid={`link-cv-${emp.userId}`}
                            >
                              <FileText className="w-4 h-4" />
                              <span>Last ned CV</span>
                              <Download className="w-3 h-3" />
                            </a>
                          )}
                          {emp.politiattestFile && (
                            <a
                              href={emp.politiattestFile}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-2 text-sm text-primary hover:underline"
                              data-testid={`link-politiattest-${emp.userId}`}
                            >
                              <ShieldCheck className="w-4 h-4" />
                              <span>Last ned politiattest</span>
                              <Download className="w-3 h-3" />
                            </a>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <div className="text-center py-8">
          <p className="text-sm text-muted-foreground" data-testid="text-no-results">
            {searchQuery
              ? "Ingen ansatte funnet for søket"
              : "Ingen ansatte registrert"}
          </p>
        </div>
      )}
    </div>
  );
}