import { useLocation, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { Home, Calendar, DollarSign, User, MessageSquare, LayoutDashboard, CheckSquare, Plus, Mail } from "lucide-react";
import type { Melding, SamtaleMelding } from "@shared/schema";

const employeeItems = [
  { path: "/", label: "Hjem", icon: Home },
  { path: "/mine-vakter", label: "Vakter", icon: Calendar },
  { path: "/meldinger", label: "Meldinger", icon: MessageSquare, badge: "employee" },
  { path: "/inntjening", label: "Lønn", icon: DollarSign },
  { path: "/profil", label: "Profil", icon: User },
];

const adminItems = [
  { path: "/admin", label: "Oversikt", icon: LayoutDashboard },
  { path: "/admin/ny-vakt", label: "Ny vakt", icon: Plus },
  { path: "/admin/godkjenn", label: "Godkjenn", icon: CheckSquare },
  { path: "/admin/meldinger", label: "Meldinger", icon: Mail, badge: "admin" },
  { path: "/profil", label: "Profil", icon: User },
];

export function BottomNav({ role }: { role: string }) {
  const [location] = useLocation();
  const { user } = useAuth();
  const items = role === "admin" ? adminItems : employeeItems;

  const { data: adminMeldinger } = useQuery<Melding[]>({
    queryKey: ["/api/meldinger"],
    enabled: role === "admin",
    refetchInterval: 30000,
  });

  const { data: userMeldinger } = useQuery<Melding[]>({
    queryKey: ["/api/meldinger/user", user?.id],
    enabled: role === "ansatt" && !!user?.id,
    refetchInterval: 30000,
  });

  const adminUnread = adminMeldinger?.filter((m) => !m.read).length || 0;

  const employeeUnread = userMeldinger?.filter((m) => {
    if (!m.reply && !m.repliedAt) return false;
    return true;
  }).length || 0;

  const getBadgeCount = (badge?: string) => {
    if (badge === "admin") return adminUnread;
    if (badge === "employee") return employeeUnread;
    return 0;
  };

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-background border-t z-50 safe-area-bottom" data-testid="bottom-nav">
      <div className="flex items-center justify-around h-16 max-w-lg mx-auto px-2">
        {items.map((item) => {
          const isActive = item.path === "/"
            ? location === "/"
            : location.startsWith(item.path);
          const badgeCount = getBadgeCount(item.badge);
          return (
            <Link key={item.path} href={item.path}>
              <button
                data-testid={`nav-${item.label.toLowerCase()}`}
                className={`flex flex-col items-center justify-center gap-0.5 px-2 py-1 rounded-md transition-colors min-w-[3.5rem] ${
                  isActive ? "text-primary" : "text-muted-foreground"
                }`}
              >
                <div className="relative">
                  <item.icon className={`w-5 h-5 ${isActive ? "stroke-[2.5]" : ""}`} />
                  {badgeCount > 0 && (
                    <span
                      data-testid={`badge-meldinger-${badgeCount}`}
                      className="absolute -top-1.5 -right-2 min-w-[16px] h-4 flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-bold px-1"
                    >
                      {badgeCount > 99 ? "99+" : badgeCount}
                    </span>
                  )}
                </div>
                <span className="text-[10px] font-medium">{item.label}</span>
              </button>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
