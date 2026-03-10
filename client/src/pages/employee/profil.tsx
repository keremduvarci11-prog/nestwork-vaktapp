import { useRef, useState } from "react";
import { useAuth } from "@/lib/auth";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useToast } from "@/hooks/use-toast";
import { MapPin, Briefcase, Mail, Phone, LogOut, History, ClipboardList, ChevronRight, Settings, CreditCard, Camera, Sun, Moon } from "lucide-react";
import { Link } from "wouter";
import logoSrc from "@assets/nestwork_logo_centered.png";
import { useTheme } from "@/components/theme-provider";
import { ImageCropper } from "@/components/image-cropper";

export default function Profil() {
  const { user, logout } = useAuth();
  const { toast } = useToast();
  const { theme, setTheme } = useTheme();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const toggleAvailability = useMutation({
    mutationFn: () =>
      apiRequest("PATCH", `/api/users/${user?.id}`, { available: !user?.available }),
    onSuccess: () => {
      toast({ title: user?.available ? "Satt som utilgjengelig" : "Satt som tilgjengelig" });
      window.location.reload();
    },
  });

  const [cropImageSrc, setCropImageSrc] = useState<string | null>(null);

  const uploadImage = useMutation({
    mutationFn: async (blob: Blob) => {
      const formData = new FormData();
      formData.append("image", blob, "profile.jpg");
      const res = await fetch(`/api/users/${user?.id}/profile-image`, {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      if (!res.ok) throw new Error("Opplasting feilet");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Profilbilde oppdatert" });
      window.location.reload();
    },
    onError: () => {
      toast({ title: "Feil", description: "Kunne ikke laste opp bilde", variant: "destructive" });
    },
  });

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => setCropImageSrc(reader.result as string);
      reader.readAsDataURL(file);
    }
    e.target.value = "";
  };

  const handleCropComplete = (blob: Blob) => {
    setCropImageSrc(null);
    uploadImage.mutate(blob);
  };

  const initials = user?.name?.split(" ").map((n) => n[0]).join("").toUpperCase() || "?";
  const isAdmin = user?.role === "admin";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Min profil</h1>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            if (theme === "light") setTheme("dark");
            else if (theme === "dark") setTheme("system");
            else setTheme("light");
          }}
          data-testid="button-theme-toggle"
          className="gap-2"
        >
          {theme === "dark" ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
          {theme === "light" ? "Lys" : theme === "dark" ? "Mørk" : "Auto"}
        </Button>
      </div>

      <Card>
        <CardContent className="p-6">
          <div className="flex items-center gap-4 mb-6">
            <div className="relative">
              <Avatar
                className={`w-16 h-16 ${!isAdmin ? "cursor-pointer" : ""}`}
                onClick={() => !isAdmin && fileInputRef.current?.click()}
                data-testid="avatar-profile"
              >
                {isAdmin ? (
                  <AvatarImage src={logoSrc} alt="Nestwork" className="object-contain p-1" />
                ) : user?.profileImage ? (
                  <AvatarImage src={user.profileImage} alt={user.name} />
                ) : null}
                <AvatarFallback className="bg-primary text-primary-foreground text-xl font-bold">
                  {initials}
                </AvatarFallback>
              </Avatar>
              {!isAdmin && (
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="absolute bottom-0 right-0 bg-primary text-primary-foreground rounded-full p-1 shadow-md"
                  data-testid="button-upload-avatar"
                >
                  <Camera className="w-3 h-3" />
                </button>
              )}
            </div>
            <div>
              <h2 className="text-lg font-bold" data-testid="text-user-name">{user?.name}</h2>
              <p className="text-sm text-muted-foreground">{user?.stilling}</p>
              {user?.externalId && (
                <p className="text-xs text-muted-foreground" data-testid="text-employee-id">Ansatt-ID: {user.externalId}</p>
              )}
              {!isAdmin && !user?.profileImage && (
                <p className="text-xs text-primary mt-0.5">Trykk for å laste opp bilde</p>
              )}
              {uploadImage.isPending && (
                <p className="text-xs text-primary mt-0.5">Laster opp...</p>
              )}
            </div>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={handleImageSelect}
            data-testid="input-avatar-upload"
          />

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
                <p className="text-sm font-medium">{user?.email || "Ikke angitt"}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Phone className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              <div>
                <p className="text-xs text-muted-foreground">Telefon</p>
                <p className="text-sm font-medium">{user?.phone || "Ikke angitt"}</p>
              </div>
            </div>
            {user?.kontonummer && (
              <div className="flex items-center gap-3">
                <CreditCard className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                <div>
                  <p className="text-xs text-muted-foreground">Kontonummer</p>
                  <p className="text-sm font-medium">{user.kontonummer}</p>
                </div>
              </div>
            )}
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

      <div className="space-y-2">
        <Link href="/innstillinger">
          <Card className="hover-elevate cursor-pointer">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Settings className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Innstillinger</span>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
              </div>
            </CardContent>
          </Card>
        </Link>

        {isAdmin && (
          <Link href="/admin/ansattes-onboarding">
            <Card className="hover-elevate cursor-pointer">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <ClipboardList className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm font-medium">Ansattes onboarding</span>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                </div>
              </CardContent>
            </Card>
          </Link>
        )}

        {user?.role !== "admin" && (
          <>
            <Link href="/historikk">
              <Card className="hover-elevate cursor-pointer">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <History className="w-4 h-4 text-muted-foreground" />
                      <span className="text-sm font-medium">Historikk</span>
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted-foreground" />
                  </div>
                </CardContent>
              </Card>
            </Link>
          </>
        )}
      </div>

      <Button
        data-testid="button-logout"
        variant="secondary"
        className="w-full"
        onClick={logout}
      >
        <LogOut className="w-4 h-4 mr-2" />
        Logg ut
      </Button>

      {cropImageSrc && (
        <ImageCropper
          imageSrc={cropImageSrc}
          onCropComplete={handleCropComplete}
          onCancel={() => setCropImageSrc(null)}
        />
      )}
    </div>
  );
}
