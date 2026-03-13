import { createContext, useContext, useState, useEffect } from "react";

type Theme = "light" | "dark" | "system";

interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextType>({
  theme: "light",
  setTheme: () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("nestwork-theme") as Theme | null;
      if (saved === "dark" || saved === "system") return saved;
      return "light";
    }
    return "light";
  });

  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove("dark");

    const applyThemeColor = (isDark: boolean) => {
      const meta = document.querySelector('meta[name="theme-color"]');
      const statusBar = document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]');
      if (meta) meta.setAttribute("content", isDark ? "#121212" : "#1a5f5f");
      if (statusBar) statusBar.setAttribute("content", isDark ? "black" : "default");
    };

    if (theme === "system") {
      const mq = window.matchMedia("(prefers-color-scheme: dark)");
      const apply = () => {
        root.classList.toggle("dark", mq.matches);
        applyThemeColor(mq.matches);
      };
      apply();
      mq.addEventListener("change", apply);
      return () => mq.removeEventListener("change", apply);
    }

    if (theme === "dark") {
      root.classList.add("dark");
    }
    applyThemeColor(theme === "dark");
  }, [theme]);

  useEffect(() => {
    localStorage.setItem("nestwork-theme", theme);
  }, [theme]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
