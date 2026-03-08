import { useAuth } from "@/lib/auth";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useToast } from "@/hooks/use-toast";
import { MapPin, Briefcase, Mail, Phone, LogOut, MessageSquare, ClipboardList, ChevronRight } from "lucide-react";
import { Link } from "wouter";

export default function Profil() {
  const { user, logout } = useAuth();
  const { toast } = useToast();

  const toggleAvailability = useMutation({
    mutationFn: () =>
      apiRequest("PATCH", `/api/users/${user?.id}`, { available: !user?.available }),
    onSuccess: () => {
      toast({ title: user?.available ? "Satt som utilgjengelig" : "Satt som tilgjengelig" });
      window.location.reload();
    },
  });

  const initials = user?.name?.split(" ").map((n) => n[0]).join("").toUpperCase() || "?";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">Min profil</h1>
      </div>

      <Card>
        <CardContent className="p-6">
          <div className="flex items-center gap-4 mb-6">
            <Avatar className="w-16 h-16">
              <AvatarFallback className="bg-primary text-primary-foreground text-xl font-bold">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div>
              <h2 className="text-lg font-bold" data-testid="text-user-name">{user?.name}</h2>
              <p className="text-sm text-muted-foreground">{user?.stilling}</p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <MapPin className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              <div>
                <p className="text-xs text-muted-foreground">Region</p>
                <p className="text-sm font-medium">{user?.region}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Briefcase className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              <div>
                <p className="text-xs text-muted-foreground">Stilling</p>
                <p className="text-sm font-medium">{user?.stilling}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Mail className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              <div>
                <p className="text-xs text-muted-foreground">E-post</p>
                <p className="text-sm font-medium">{user?.email}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Phone className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              <div>
                <p className="text-xs text-muted-foreground">Telefon</p>
                <p className="text-sm font-medium">{user?.phone}</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Tilgjengelig for vakter</p>
              <p className="text-xs text-muted-foreground">Admin ser om du er tilgjengelig</p>
            </div>
            <Switch
              data-testid="switch-availability"
              checked={user?.available ?? false}
              onCheckedChange={() => toggleAvailability.mutate()}
            />
          </div>
        </CardContent>
      </Card>

      {user?.role !== "admin" && (
        <div className="space-y-2">
          <Link href="/meldinger">
            <Card className="hover-elevate cursor-pointer">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <MessageSquare className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm font-medium">Meldinger</span>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                </div>
              </CardContent>
            </Card>
          </Link>
          <Link href="/onboarding">
            <Card className="hover-elevate cursor-pointer">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <ClipboardList className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm font-medium">Onboarding-sjekkliste</span>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                </div>
              </CardContent>
            </Card>
          </Link>
        </div>
      )}

      <Button
        data-testid="button-logout"
        variant="secondary"
        className="w-full"
        onClick={logout}
      >
        <LogOut className="w-4 h-4 mr-2" />
        Logg ut
      </Button>
    </div>
  );
}
