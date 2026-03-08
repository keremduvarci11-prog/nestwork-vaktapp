import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/lib/auth";
import { BottomNav } from "@/components/bottom-nav";
import LoginPage from "@/pages/login";
import EmployeeHome from "@/pages/employee/home";
import MineVakter from "@/pages/employee/mine-vakter";
import Historikk from "@/pages/employee/historikk";
import Inntjening from "@/pages/employee/inntjening";
import Profil from "@/pages/employee/profil";
import Meldinger from "@/pages/employee/meldinger";
import OnboardingPage from "@/pages/employee/onboarding";
import AdminDashboard from "@/pages/admin/dashboard";
import NyVakt from "@/pages/admin/ny-vakt";
import GodkjennVakter from "@/pages/admin/godkjenn";
import AdminMeldinger from "@/pages/admin/meldinger";
import AlleVakter from "@/pages/admin/alle-vakter";
import Innstillinger from "@/pages/employee/innstillinger";
import NotFound from "@/pages/not-found";
import { Loader2 } from "lucide-react";
import { NestworkLogo } from "@/components/nestwork-logo";

function AppContent() {
  const { user, isLoading } = useAuth();

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

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 bg-background/95 backdrop-blur border-b z-40">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <NestworkLogo size={32} />
            <span className="font-bold text-sm">Nestwork</span>
          </div>
          {isAdmin && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">Admin</span>
          )}
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-4 pb-24">
        <Switch>
          {isAdmin ? (
            <>
              <Route path="/" component={AdminDashboard} />
              <Route path="/admin" component={AdminDashboard} />
              <Route path="/admin/ny-vakt" component={NyVakt} />
              <Route path="/admin/godkjenn" component={GodkjennVakter} />
              <Route path="/admin/meldinger" component={AdminMeldinger} />
              <Route path="/admin/alle-vakter" component={AlleVakter} />
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
              <Route path="/onboarding" component={OnboardingPage} />
            </>
          )}
          <Route component={NotFound} />
        </Switch>
      </main>

      <BottomNav role={user.role} />
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthProvider>
          <Toaster />
          <AppContent />
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
