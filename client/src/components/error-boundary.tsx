import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  errorMessage: string;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, errorMessage: "" };
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      errorMessage: error?.message || "Ukjent feil",
    };
  }

  componentDidCatch(error: Error, errorInfo: { componentStack?: string }) {
    // Log to console (visible in adb logcat / Safari devtools).
    // Never throw further — that would crash the WebView and trigger
    // the Android "this app has a bug" dialog that Google Play rejects on.
    try {
      console.error("[ErrorBoundary]", error?.message, errorInfo?.componentStack);
    } catch {
      /* swallow */
    }
  }

  handleReload = () => {
    try {
      window.location.reload();
    } catch {
      /* swallow */
    }
  };

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            minHeight: "100vh",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: "24px",
            backgroundColor: "#ffffff",
            color: "#0f172a",
            fontFamily:
              "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
            textAlign: "center",
          }}
          data-testid="error-boundary-fallback"
        >
          <div
            style={{
              maxWidth: 360,
              width: "100%",
            }}
          >
            <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>
              Noe gikk galt
            </h1>
            <p
              style={{
                fontSize: 14,
                color: "#475569",
                marginBottom: 20,
                lineHeight: 1.5,
              }}
            >
              Vi opplever et midlertidig problem. Prøv å laste appen på nytt.
            </p>
            <button
              onClick={this.handleReload}
              data-testid="button-reload-app"
              style={{
                width: "100%",
                padding: "12px 16px",
                fontSize: 14,
                fontWeight: 600,
                backgroundColor: "#0f766e",
                color: "#ffffff",
                border: "none",
                borderRadius: 8,
                cursor: "pointer",
              }}
            >
              Last appen på nytt
            </button>
            {this.state.errorMessage ? (
              <p
                style={{
                  marginTop: 16,
                  fontSize: 11,
                  color: "#94a3b8",
                  wordBreak: "break-word",
                }}
                data-testid="text-error-detail"
              >
                {this.state.errorMessage}
              </p>
            ) : null}
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
