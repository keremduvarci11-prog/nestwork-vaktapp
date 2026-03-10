import { useState, useRef } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Camera, Save, Eye, EyeOff, Sun, Moon } from "lucide-react";
import { useTheme } from "@/components/theme-provider";
import { useLocation } from "wouter";

export default function Innstillinger() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { theme, setTheme } = useTheme();
  const [, navigate] = useLocation();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [username, setUsername] = useState(user?.username || "");
  const [email, setEmail] = useState(user?.email || "");
  const [phone, setPhone] = useState(user?.phone || "");
  const [address, setAddress] = useState(user?.address || "");
  const [kontonummer, setKontonummer] = useState(user?.kontonummer || "");

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);

  const initials = user?.name?.split(" ").map((n: string) => n[0]).join("").toUpperCase() || "?";

  const updateProfile = useMutation({
    mutationFn: () =>
      apiRequest("PATCH", `/api/users/${user?.id}`, {
        username,
        email,
        phone,
        address,
        kontonummer,
      }),
    onSuccess: () => {
      toast({ title: "Profil oppdatert" });
      window.location.reload();
    },
    onError: () => {
      toast({ title: "Feil", description: "Kunne ikke oppdatere profil", variant: "destructive" });
    },
  });

  const changePassword = useMutation({
    mutationFn: () =>
      apiRequest("POST", `/api/users/${user?.id}/change-password`, {
        currentPassword,
        newPassword,
      }),
    onSuccess: () => {
      toast({ title: "Passord endret" });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    },
    onError: (err: any) => {
      toast({
        title: "Feil",
        description: err?.message || "Kunne ikke endre passord",
        variant: "destructive",
      });
    },
  });

  const uploadImage = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("image", file);
      const res = await fetch(`/api/users/${user?.id}/profile-image`, {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message);
      }
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
      uploadImage.mutate(file);
    }
  };

  const handlePasswordSubmit = () => {
    if (!currentPassword || !newPassword) {
      toast({ title: "Fyll ut begge passord-feltene", variant: "destructive" });
      return;
    }
    if (newPassword.length < 6) {
      toast({ title: "Passord må være minst 6 tegn", variant: "destructive" });
      return;
    }
    if (newPassword !== confirmPassword) {
      toast({ title: "Passordene stemmer ikke overens", variant: "destructive" });
      return;
    }
    changePassword.mutate();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate("/profil")} data-testid="button-back-profil">
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <h1 className="text-xl font-bold">Innstillinger</h1>
      </div>

      <Card>
        <CardContent className="p-4">
          <p className="text-sm font-semibold mb-3">Profilbilde</p>
          <div className="flex items-center gap-4">
            <div className="relative">
              <Avatar className="w-20 h-20">
                {user?.profileImage ? (
                  <AvatarImage src={user.profileImage} alt={user.name} />
                ) : null}
                <AvatarFallback className="bg-primary text-primary-foreground text-2xl font-bold">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="absolute bottom-0 right-0 bg-primary text-primary-foreground rounded-full p-1.5 shadow-md"
                data-testid="button-change-photo"
              >
                <Camera className="w-3.5 h-3.5" />
              </button>
            </div>
            <div>
              <p className="text-sm font-medium">{user?.name}</p>
              <p className="text-xs text-muted-foreground">Trykk kameraikonet for å endre bilde</p>
              {uploadImage.isPending && (
                <p className="text-xs text-primary mt-1">Laster opp...</p>
              )}
            </div>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={handleImageSelect}
            data-testid="input-profile-image"
          />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4 space-y-4">
          <p className="text-sm font-semibold">Kontaktinformasjon</p>

          <div className="space-y-2">
            <label className="text-xs font-medium">Brukernavn</label>
            <Input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              data-testid="input-username"
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-medium">E-post</label>
            <Input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              data-testid="input-email"
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-medium">Telefon</label>
            <Input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              type="tel"
              data-testid="input-phone"
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-medium">Adresse</label>
            <Input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              data-testid="input-address"
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-medium">Kontonummer</label>
            <Input
              value={kontonummer}
              onChange={(e) => setKontonummer(e.target.value)}
              placeholder="1234 56 78901"
              data-testid="input-kontonummer"
            />
          </div>

          <Button
            className="w-full"
            onClick={() => updateProfile.mutate()}
            disabled={updateProfile.isPending}
            data-testid="button-save-profile"
          >
            <Save className="w-4 h-4 mr-1" />
            Lagre endringer
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4 space-y-4">
          <p className="text-sm font-semibold">Bytt passord</p>

          <div className="space-y-2">
            <label className="text-xs font-medium">Nåværende passord</label>
            <div className="relative">
              <Input
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                type={showCurrent ? "text" : "password"}
                data-testid="input-current-password"
              />
              <button
                type="button"
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground"
                onClick={() => setShowCurrent(!showCurrent)}
              >
                {showCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-medium">Nytt passord</label>
            <div className="relative">
              <Input
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                type={showNew ? "text" : "password"}
                data-testid="input-new-password"
              />
              <button
                type="button"
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground"
                onClick={() => setShowNew(!showNew)}
              >
                {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-medium">Bekreft nytt passord</label>
            <Input
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              type="password"
              data-testid="input-confirm-password"
            />
          </div>

          <Button
            className="w-full"
            variant="secondary"
            onClick={handlePasswordSubmit}
            disabled={changePassword.isPending}
            data-testid="button-change-password"
          >
            Bytt passord
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {theme === "dark" ? <Moon className="w-4 h-4 text-muted-foreground" /> : <Sun className="w-4 h-4 text-muted-foreground" />}
              <div>
                <p className="text-sm font-medium">Mørk modus</p>
                <p className="text-xs text-muted-foreground">
                  {theme === "dark" ? "Aktivert" : theme === "system" ? "Automatisk" : "Deaktivert"}
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                if (theme === "light") setTheme("dark");
                else if (theme === "dark") setTheme("system");
                else setTheme("light");
              }}
              data-testid="button-theme-toggle"
            >
              {theme === "light" ? "Av" : theme === "dark" ? "På" : "Auto"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
