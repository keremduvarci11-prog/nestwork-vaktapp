import { Capacitor } from "@capacitor/core";

// Blob download links are not handled reliably by Android WebView.
export async function shareNativePdf(blob: Blob, filename: string): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false;
  if (!Capacitor.isPluginAvailable("Filesystem") || !Capacitor.isPluginAvailable("Share")) {
    throw new Error("Oppdater Nestwork-appen for å lagre eller dele PDF. Du kan fortsatt lese lønnsslippen inne i appen.");
  }
  const data = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1]);
    reader.onerror = () => reject(new Error("Kunne ikke klargjøre PDF-en."));
    reader.readAsDataURL(blob);
  });
  const { Filesystem, Directory } = await import("@capacitor/filesystem");
  const { Share } = await import("@capacitor/share");
  const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
  const { uri } = await Filesystem.writeFile({
    path: `payroll-${Date.now()}-${safeName}`,
    data,
    directory: Directory.Cache,
  });
  await Share.share({ title: filename, files: [uri], dialogTitle: "Lagre eller del lønnsslipp" });
  return true;
}
