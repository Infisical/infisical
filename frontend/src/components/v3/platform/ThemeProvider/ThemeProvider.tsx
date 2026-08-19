import * as React from "react";

export type Theme = "dark" | "light" | "system";

type ThemeContextValue = {
  theme: Theme;
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

const getSystemTheme = () =>
  window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";

const applyTheme = (theme: Theme) => {
  const resolvedTheme = theme === "system" ? getSystemTheme() : theme;
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
  applyTheme(theme);
  return theme;
};

export const ThemeProvider = ({ children }: React.PropsWithChildren) => {
  const [theme, setThemeState] = React.useState<Theme>(readStoredTheme);

  React.useLayoutEffect(() => {
    applyTheme(theme);
  }, [theme]);

  React.useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key !== THEME_STORAGE_KEY || !isTheme(event.newValue)) return;
      setThemeState(event.newValue);
    };

    const mediaQuery = window.matchMedia("(prefers-color-scheme: light)");
    const handleSystemThemeChange = () => {
      if (theme === "system") applyTheme(theme);
    };

    window.addEventListener("storage", handleStorage);
    mediaQuery.addEventListener("change", handleSystemThemeChange);
    return () => {
      window.removeEventListener("storage", handleStorage);
      mediaQuery.removeEventListener("change", handleSystemThemeChange);
    };
  }, [theme]);

  const setTheme = React.useCallback((nextTheme: Theme) => {
    applyTheme(nextTheme);
    persistTheme(nextTheme);
    setThemeState(nextTheme);
  }, []);

  const value = React.useMemo(() => ({ theme, setTheme }), [setTheme, theme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

export const useTheme = () => {
  const context = React.useContext(ThemeContext);
  if (!context) throw new Error("useTheme must be used within ThemeProvider");
  return context;
};
