import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { ErrorBoundary } from "./components/error-boundary";

// Last-resort native crash protection: any uncaught error/promise rejection
// inside the WebView would otherwise bubble to Android and look like a
// native crash to Google Play's automated review. Swallow them so the
// ErrorBoundary fallback (or app itself) stays alive.
window.addEventListener("error", (e) => {
  try {
    console.error("[window.error]", e?.error?.message || e?.message);
  } catch {
    /* swallow */
  }
});

window.addEventListener("unhandledrejection", (e) => {
  try {
    console.error("[unhandledrejection]", (e as PromiseRejectionEvent)?.reason);
  } catch {
    /* swallow */
  }
});

createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>,
);
