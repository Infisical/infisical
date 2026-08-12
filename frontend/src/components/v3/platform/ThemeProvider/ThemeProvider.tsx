import * as React from "react";

export type Theme = "dark";

type ThemeContextValue = {
  theme: Theme;
  setTheme: (theme: Theme) => void;
};

const THEME_STORAGE_KEY = "infisical-theme";
const DEFAULT_THEME: Theme = "dark";

const ThemeContext = React.createContext<ThemeContextValue | null>(null);

const isTheme = (value: string | null): value is Theme => value === "dark";

const readStoredTheme = (): Theme => {
  try {
    const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isTheme(storedTheme) ? storedTheme : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
};

const applyTheme = (theme: Theme) => {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
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

    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

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
