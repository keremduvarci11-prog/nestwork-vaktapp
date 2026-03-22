import { useLocation, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { Home, Calendar, User, MessageSquare, LayoutDashboard, CheckSquare, Plus, Mail, ClipboardCheck } from "lucide-react";

interface OnboardingItem {
  id: string;
  userId: string;
  item: string;
  completed: boolean | null;
  completedAt: string | null;
}

const employeeItems = [
  { path: "/", label: "Hjem", icon: Home },
  { path: "/mine-vakter", label: "Vakter", icon: Calendar },
  { path: "/meldinger", label: "Meldinger", icon: MessageSquare, badge: "employee" as const },
  { path: "/onboarding", label: "Onboarding", icon: ClipboardCheck, showProgress: true },
  { path: "/profil", label: "Profil", icon: User },
];

const adminItems = [
  { path: "/admin", label: "Oversikt", icon: LayoutDashboard },
  { path: "/admin/ny-vakt", label: "Ny vakt", icon: Plus },
  { path: "/admin/godkjenn", label: "Godkjenn", icon: CheckSquare },
  { path: "/admin/meldinger", label: "Meldinger", icon: Mail, badge: "admin" as const },
  { path: "/profil", label: "Profil", icon: User },
];

function getProgressColor(percent: number): string {
  if (percent <= 0) return "#ef4444";
  if (percent < 50) return "#f97316";
  if (percent < 100) return "#eab308";
  return "#22c55e";
}

function CircularProgress({ percent }: { percent: number }) {
  const size = 28;
  const strokeWidth = 2.5;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percent / 100) * circumference;
  const color = getProgressColor(percent);

  return (
    <svg
      width={size}
      height={size}
      className="absolute -top-1 -left-1"
      data-testid="progress-ring-onboarding"
    >
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        className="opacity-10"
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
    </svg>
  );
}

export function BottomNav({ role }: { role: string }) {
  const [location] = useLocation();
  const { user } = useAuth();
  const items = role === "admin" ? adminItems : employeeItems;

  const { data: adminCount } = useQuery<{ count: number }>({
    queryKey: ["/api/meldinger/unread-count/admin"],
    enabled: role === "admin",
    refetchInterval: 15000,
  });

  const { data: userCount } = useQuery<{ count: number }>({
    queryKey: ["/api/meldinger/unread-count/user", user?.id],
    enabled: role === "ansatt" && !!user?.id,
    refetchInterval: 15000,
  });

  const { data: onboardingItems } = useQuery<OnboardingItem[]>({
    queryKey: ["/api/onboarding", user?.id],
    enabled: role !== "admin" && !!user?.id,
  });

  const onboardingProgress = (() => {
    if (!onboardingItems || onboardingItems.length === 0) return 0;
    const completed = onboardingItems.filter((i) => i.completed).length;
    return Math.round((completed / onboardingItems.length) * 100);
  })();

  const getBadgeCount = (badge?: string) => {
    if (badge === "admin") return adminCount?.count || 0;
    if (badge === "employee") return userCount?.count || 0;
    return 0;
  };

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-background border-t z-50" data-testid="bottom-nav" style={{ paddingBottom: "max(env(safe-area-inset-bottom, 0px), 12px)" }}>
      <div className="flex items-center justify-around h-16 max-w-lg mx-auto px-2">
        {items.map((item) => {
          const isActive = item.path === "/"
            ? location === "/"
            : location.startsWith(item.path);
          const badgeCount = getBadgeCount(item.badge);
          const showProgress = 'showProgress' in item && item.showProgress;
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
                  {showProgress && onboardingItems && onboardingItems.length > 0 && (
                    <CircularProgress percent={onboardingProgress} />
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
