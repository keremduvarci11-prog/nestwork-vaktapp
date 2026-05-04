import { useRef, useState, useMemo } from "react";
import { useAuth } from "@/lib/auth";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useToast } from "@/hooks/use-toast";
import { MapPin, Briefcase, Mail, Phone, LogOut, History, ClipboardList, ChevronRight, Settings, Camera, Sun, Moon, ClipboardCheck, Wallet, TrendingUp, BookOpen } from "lucide-react";
import { Link } from "wouter";
import logoSrc from "@assets/nestwork_logo_centered.png";
import { useTheme } from "@/components/theme-provider";
import { ImageCropper } from "@/components/image-cropper";
import type { Vakt } from "@shared/schema";

const MONTH_NAMES_NB = ["januar", "februar", "mars", "april", "mai", "juni", "juli", "august", "september", "oktober", "november", "desember"];

function calcShiftHours(start: string, end: string, trekkPause?: boolean | null) {
  if (!start || !end) return 0;
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  let h = (eh * 60 + em - sh * 60 - sm) / 60;
  if (trekkPause) h -= 0.5;
  return Math.max(0, h);
}

function formatNok(n: number) {
  return n.toLocaleString("nb-NO", { maximumFractionDigits: 2 });
}

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

  const { data: mineVakter } = useQuery<Vakt[]>({
    queryKey: ["/api/vakter/mine", user?.id],
    enabled: !!user?.id && !isAdmin,
  });

  const lonnSummary = useMemo(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();
    const monthLabel = `${MONTH_NAMES_NB[m]} ${y}`;
    const timelonn = parseFloat(user?.timelonn || "0") || 0;
    let totalHours = 0;
    let count = 0;
    (mineVakter || []).forEach((v) => {
      if (!v.dato || v.status !== "godkjent") return;
      const d = new Date(v.dato + "T00:00:00");
      if (d.getFullYear() !== y || d.getMonth() !== m) return;
      totalHours += calcShiftHours(v.startTid || "", v.sluttTid || "", v.trekkPause);
      count += 1;
    });
    const brutto = totalHours * timelonn;
    return { monthLabel, timelonn, totalHours, count, brutto };
  }, [mineVakter, user?.timelonn]);

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
          </div>
        </CardContent>
      </Card>

      {!isAdmin && (
        <Card data-testid="card-lonn-oversikt">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Wallet className="w-4 h-4 text-primary" />
                <h3 className="text-sm font-bold">Lønn-oversikt</h3>
              </div>
              <Link href="/lonn-timer">
                <button className="text-xs text-primary hover:underline" data-testid="link-lonn-detaljer">
                  Se detaljer
                </button>
              </Link>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-md border p-3">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Timelønn</p>
                {lonnSummary.timelonn > 0 ? (
                  <p className="text-base font-bold mt-0.5" data-testid="text-profil-timelonn">
                    {formatNok(lonnSummary.timelonn)} kr<span className="text-xs font-normal text-muted-foreground">/t</span>
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground mt-1" data-testid="text-profil-timelonn-mangler">
                    Ikke satt – kontakt admin
                  </p>
                )}
              </div>
              <div className="rounded-md border p-3">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground flex items-center gap-1">
                  <TrendingUp className="w-3 h-3" />
                  Brutto i {lonnSummary.monthLabel}
                </p>
                <p className="text-base font-bold mt-0.5" data-testid="text-profil-brutto">
                  {formatNok(lonnSummary.brutto)} kr
                </p>
                <p className="text-[10px] text-muted-foreground mt-0.5" data-testid="text-profil-timer">
                  {lonnSummary.totalHours.toFixed(2).replace(".", ",")} t · {lonnSummary.count} vakt{lonnSummary.count === 1 ? "" : "er"}
                </p>
              </div>
            </div>

            <p className="text-[10px] text-muted-foreground">
              Estimatet oppdateres automatisk hver gang en vakt blir godkjent.
            </p>
          </CardContent>
        </Card>
      )}

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

        {!isAdmin && (
          <Link href="/personalregler">
            <Card className="hover-elevate cursor-pointer" data-testid="link-personalregler">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <BookOpen className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm font-medium">Personalregler</span>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                </div>
              </CardContent>
            </Card>
          </Link>
        )}

        {isAdmin && (
          <Link href="/admin/ansatte">
            <Card className="hover-elevate cursor-pointer" data-testid="link-admin-ansatte">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <ClipboardList className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm font-medium">Ansatte</span>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                </div>
              </CardContent>
            </Card>
          </Link>
        )}

        {user?.role !== "admin" && (
          <>
            <Link href="/onboarding">
              <Card className="hover-elevate cursor-pointer" data-testid="link-onboarding">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <ClipboardCheck className="w-4 h-4 text-muted-foreground" />
                      <span className="text-sm font-medium">Onboarding</span>
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted-foreground" />
                  </div>
                </CardContent>
              </Card>
            </Link>

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
