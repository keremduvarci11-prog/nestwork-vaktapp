import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "no.nestwork.vaktapp",
  appName: "Nestwork",
  webDir: "dist/public",
  server: {
    url: "https://nestwork-vaktapp.replit.app",
    cleartext: true,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      backgroundColor: "#ffffff",
      showSpinner: false,
      launchAutoHide: true,
    },
    StatusBar: {
      style: "LIGHT",
      backgroundColor: "#ffffff",
    },
    Keyboard: {
      resize: "body",
      resizeOnFullScreen: true,
    },
  },
  ios: {
    contentInset: "automatic",
    preferredContentMode: "mobile",
    scheme: "Nestwork",
  },
  android: {
    allowMixedContent: true,
  },
};

export default config;
