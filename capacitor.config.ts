import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "no.nestwork.vaktapp",
  appName: "Nestwork",
  webDir: "dist/public",
  server: {
    url: "https://nestwork-shift-manager.replit.app",
    cleartext: true,
    allowNavigation: ["nestwork-shift-manager.replit.app"],
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      backgroundColor: "#ffffff",
      showSpinner: false,
      launchAutoHide: true,
    },
    StatusBar: {
      style: "DARK",
      backgroundColor: "#ffffff",
    },
    Keyboard: {
      resize: "body",
      resizeOnFullScreen: true,
    },
  },
  ios: {
    contentInset: "never",
    preferredContentMode: "mobile",
    scheme: "Nestwork",
    appendUserAgent: "NestworkApp",
    backgroundColor: "#ffffff",
    scrollEnabled: false,
  },
  android: {
    allowMixedContent: true,
    // Push is iOS-only (APNs). Excluding the push plugin on Android removes
    // all Firebase code from the APK and eliminates the startup-crash risk
    // Google Play reported (Firebase auto-init without google-services.json).
    includePlugins: [
      "@capacitor/keyboard",
      "@capacitor/splash-screen",
      "@capacitor/status-bar",
    ],
  },
};

export default config;
