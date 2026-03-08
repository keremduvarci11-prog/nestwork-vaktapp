import { useLocation, Link } from "wouter";
import { Home, Calendar, History, DollarSign, User, MessageSquare, ClipboardList, LayoutDashboard, CheckSquare, Plus, Mail } from "lucide-react";

const employeeItems = [
  { path: "/", label: "Hjem", icon: Home },
  { path: "/mine-vakter", label: "Vakter", icon: Calendar },
  { path: "/historikk", label: "Historikk", icon: History },
  { path: "/inntjening", label: "Lønn", icon: DollarSign },
  { path: "/profil", label: "Profil", icon: User },
];

const adminItems = [
  { path: "/admin", label: "Oversikt", icon: LayoutDashboard },
  { path: "/admin/ny-vakt", label: "Ny vakt", icon: Plus },
  { path: "/admin/godkjenn", label: "Godkjenn", icon: CheckSquare },
  { path: "/admin/meldinger", label: "Meldinger", icon: Mail },
  { path: "/profil", label: "Profil", icon: User },
];

export function BottomNav({ role }: { role: string }) {
  const [location] = useLocation();
  const items = role === "admin" ? adminItems : employeeItems;

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-background border-t z-50 safe-area-bottom" data-testid="bottom-nav">
      <div className="flex items-center justify-around h-16 max-w-lg mx-auto px-2">
        {items.map((item) => {
          const isActive = item.path === "/"
            ? location === "/"
            : location.startsWith(item.path);
          return (
            <Link key={item.path} href={item.path}>
              <button
                data-testid={`nav-${item.label.toLowerCase()}`}
                className={`flex flex-col items-center justify-center gap-0.5 px-2 py-1 rounded-md transition-colors min-w-[3.5rem] ${
                  isActive ? "text-primary" : "text-muted-foreground"
                }`}
              >
                <item.icon className={`w-5 h-5 ${isActive ? "stroke-[2.5]" : ""}`} />
                <span className="text-[10px] font-medium">{item.label}</span>
              </button>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
