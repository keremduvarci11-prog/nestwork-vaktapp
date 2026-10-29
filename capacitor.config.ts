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
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"],
    },
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
    includePlugins: [
      "@capacitor/filesystem",
      "@capacitor/keyboard",
      "@capacitor/push-notifications",
      "@capacitor/share",
      "@capacitor/splash-screen",
      "@capacitor/status-bar",
    ],
  },
};

export default config;
