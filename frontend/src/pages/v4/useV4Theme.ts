import { useEffect, useSyncExternalStore } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";

import { useTheme } from "@app/components/v3/platform/ThemeProvider/ThemeProvider";

type Override = "light" | "dark";

const KEY = "v4-theme-override";
const listeners = new Set<() => void>();

const readStored = (): Override | undefined => {
  try {
    const value = window.sessionStorage.getItem(KEY);
    return value === "light" || value === "dark" ? value : undefined;
  } catch {
    return undefined;
  }
};

const writeStored = (value: Override | undefined) => {
  try {
    if (value) window.sessionStorage.setItem(KEY, value);
    else window.sessionStorage.removeItem(KEY);
  } catch {
    return;
  }
  listeners.forEach((listener) => listener());
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

const useUrlOverride = () =>
  useRouterState({
    select: (state): Override | undefined => {
      const value = (state.location.search as { theme?: unknown }).theme;
      return value === "light" || value === "dark" ? value : undefined;
    }
  });

// A ?theme= preview (the workbench iframe and its live link) holds for the rest of the tab's visit,
// so in-app navigation, which drops the search param, keeps the previewed theme.
export const useV4AppTheme = () => {
  const { resolvedTheme } = useTheme();
  const fromUrl = useUrlOverride();
  const stored = useSyncExternalStore(subscribe, readStored, () => undefined);
  useEffect(() => {
    if (fromUrl && fromUrl !== readStored()) writeStored(fromUrl);
  }, [fromUrl]);
  return fromUrl ?? stored ?? resolvedTheme;
};

export const useClearThemeOverride = () => {
  const navigate = useNavigate();
  const fromUrl = useUrlOverride();
  return () => {
    writeStored(undefined);
    if (!fromUrl) return;
    navigate({
      to: ".",
      search: ((previous: Record<string, unknown>) => {
        const { theme: _theme, ...rest } = previous;
        return rest;
      }) as never,
      replace: true
    });
  };
};
