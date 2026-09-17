import * as React from "react";

import { isDarkAuthPath } from "./auth-theme";

export type Theme = "dark" | "light" | "system";
export type ResolvedTheme = Exclude<Theme, "system">;

type ThemeContextValue = {
  theme: Theme;
  resolvedTheme: ResolvedTheme;
  setTheme: (theme: Theme) => void;
};

const THEME_STORAGE_KEY = "infisical-theme";
const DEFAULT_THEME: Theme = "dark";

const ThemeContext = React.createContext<ThemeContextValue | null>(null);

const isTheme = (value: string | null): value is Theme =>
  value === "dark" || value === "light" || value === "system";

const readStoredTheme = (): Theme => {
  try {
    const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isTheme(storedTheme) ? storedTheme : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
};

const getSystemTheme = (): ResolvedTheme =>
  window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";

const resolveTheme = (
  theme: Theme,
  pathname: string,
  systemTheme: ResolvedTheme = getSystemTheme()
): ResolvedTheme => {
  if (isDarkAuthPath(pathname)) return "dark";
  return theme === "system" ? systemTheme : theme;
};

const applyTheme = (resolvedTheme: ResolvedTheme) => {
  document.documentElement.dataset.theme = resolvedTheme;
  document.documentElement.style.colorScheme = resolvedTheme;
};

const persistTheme = (theme: Theme) => {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Theme selection still applies for this session when storage is unavailable.
  }
};

export const initializeTheme = () => {
  const theme = readStoredTheme();
  applyTheme(resolveTheme(theme, window.location.pathname));
  return theme;
};

export const ThemeProvider = ({
  children,
  pathname
}: React.PropsWithChildren<{ pathname: string }>) => {
  const [theme, setThemeState] = React.useState<Theme>(readStoredTheme);
  const [systemTheme, setSystemTheme] = React.useState<ResolvedTheme>(getSystemTheme);
  const resolvedTheme = resolveTheme(theme, pathname, systemTheme);

  React.useLayoutEffect(() => {
    applyTheme(resolvedTheme);
  }, [resolvedTheme]);

  React.useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key !== THEME_STORAGE_KEY || !isTheme(event.newValue)) return;
      setThemeState(event.newValue);
    };

    const mediaQuery = window.matchMedia("(prefers-color-scheme: light)");
    const handleSystemThemeChange = (event: MediaQueryListEvent) => {
      setSystemTheme(event.matches ? "light" : "dark");
    };

    window.addEventListener("storage", handleStorage);
    mediaQuery.addEventListener("change", handleSystemThemeChange);
    return () => {
      window.removeEventListener("storage", handleStorage);
      mediaQuery.removeEventListener("change", handleSystemThemeChange);
    };
  }, []);

  const setTheme = React.useCallback(
    (nextTheme: Theme) => {
      const nextResolvedTheme = resolveTheme(nextTheme, pathname);
      const updateTheme = () => {
        applyTheme(nextResolvedTheme);
        persistTheme(nextTheme);
        setThemeState(nextTheme);
      };

      if (
        nextResolvedTheme === resolvedTheme ||
        !("startViewTransition" in document) ||
        window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ) {
        updateTheme();
        return;
      }

      document.startViewTransition(updateTheme);
    },
    [pathname, resolvedTheme]
  );

  const value = React.useMemo(
    () => ({ resolvedTheme, setTheme, theme }),
    [resolvedTheme, setTheme, theme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

export const useTheme = () => {
  const context = React.useContext(ThemeContext);
  if (!context) throw new Error("useTheme must be used within ThemeProvider");
  return context;
};
