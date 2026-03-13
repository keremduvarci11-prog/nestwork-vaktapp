import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/lib/auth";
import { ThemeProvider } from "@/components/theme-provider";
import { BottomNav } from "@/components/bottom-nav";
import { PullToRefresh } from "@/components/pull-to-refresh";
import LoginPage from "@/pages/login";
import EmployeeHome from "@/pages/employee/home";
import MineVakter from "@/pages/employee/mine-vakter";
import Historikk from "@/pages/employee/historikk";
import Inntjening from "@/pages/employee/inntjening";
import Profil from "@/pages/employee/profil";
import Meldinger from "@/pages/employee/meldinger";
import OnboardingPage from "@/pages/employee/onboarding";
import Varsler from "@/pages/employee/varsler";
import AdminDashboard from "@/pages/admin/dashboard";
import NyVakt from "@/pages/admin/ny-vakt";
import GodkjennVakter from "@/pages/admin/godkjenn";
import AdminMeldinger from "@/pages/admin/meldinger";
import AlleVakter from "@/pages/admin/alle-vakter";
import AnsattesOnboarding from "@/pages/admin/ansattes-onboarding";
import Innstillinger from "@/pages/employee/innstillinger";
import NotFound from "@/pages/not-found";
import { Loader2, Bell } from "lucide-react";
import { NestworkLogo } from "@/components/nestwork-logo";
import { useLocation, Link } from "wouter";
import { useEffect } from "react";
import { initPush } from "@/lib/push";

function AppContent() {
  const { user, isLoading } = useAuth();
  const [location] = useLocation();

  const { data: unreadVarsler } = useQuery<{ count: number }>({
    queryKey: ["/api/varsler/unread-count"],
    enabled: !!user,
    refetchInterval: 15000,
  });

  useEffect(() => {
    if (user) {
      initPush();
    }
  }, [user]);

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === "visible" && user) {
        queryClient.invalidateQueries();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [user]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background gap-4">
        <NestworkLogo size={56} />
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return <LoginPage />;
  }

  const isAdmin = user.role === "admin";
  const varselCount = unreadVarsler?.count || 0;

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 bg-background/95 backdrop-blur border-b z-40">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <NestworkLogo size={32} />
            <span className="font-bold text-sm">Nestwork</span>
          </div>
          <div className="flex items-center gap-2">
            {isAdmin && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">Admin</span>
            )}
            <Link href="/varsler">
              <button
                className={`relative p-2 rounded-md transition-colors ${location === "/varsler" ? "text-primary" : "text-muted-foreground hover:text-foreground"}`}
                data-testid="button-varsler"
              >
                <Bell className="w-5 h-5" />
                {varselCount > 0 && (
                  <span
                    className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-bold px-1"
                    data-testid="badge-varsler"
                  >
                    {varselCount > 99 ? "99+" : varselCount}
                  </span>
                )}
              </button>
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-4 pb-28">
        <PullToRefresh>
        <Switch>
          {isAdmin ? (
            <>
              <Route path="/" component={AdminDashboard} />
              <Route path="/admin" component={AdminDashboard} />
              <Route path="/admin/ny-vakt" component={NyVakt} />
              <Route path="/admin/godkjenn" component={GodkjennVakter} />
              <Route path="/admin/meldinger" component={AdminMeldinger} />
              <Route path="/admin/alle-vakter" component={AlleVakter} />
              <Route path="/admin/ansattes-onboarding" component={AnsattesOnboarding} />
              <Route path="/varsler" component={Varsler} />
              <Route path="/profil" component={Profil} />
              <Route path="/innstillinger" component={Innstillinger} />
            </>
          ) : (
            <>
              <Route path="/" component={EmployeeHome} />
              <Route path="/mine-vakter" component={MineVakter} />
              <Route path="/historikk" component={Historikk} />
              <Route path="/inntjening" component={Inntjening} />
              <Route path="/profil" component={Profil} />
              <Route path="/innstillinger" component={Innstillinger} />
              <Route path="/meldinger" component={Meldinger} />
              <Route path="/varsler" component={Varsler} />
              <Route path="/onboarding" component={OnboardingPage} />
            </>
          )}
          <Route component={NotFound} />
        </Switch>
        </PullToRefresh>
      </main>

      <BottomNav role={user.role} />
    </div>
  );
}

function App() {
  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <AuthProvider>
            <Toaster />
            <AppContent />
          </AuthProvider>
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

export default App;
