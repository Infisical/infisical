import { useCallback, useEffect, useSyncExternalStore } from "react";
import { useNavigate, useParams, useRouterState } from "@tanstack/react-router";

import {
  type Theme,
  type ThemeChangeSource,
  useTheme
} from "@app/components/v3/platform/ThemeProvider/ThemeProvider";

import { V4_DEMO_ORG_ID } from "./mode";

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

const useIsLiveOrg = () => {
  const { orgId } = useParams({ strict: false }) as { orgId?: string };
  return Boolean(orgId) && orgId !== V4_DEMO_ORG_ID;
};

const useClearThemeOverride = () => {
  const navigate = useNavigate();
  const location = useRouterState({ select: (state) => state.location });
  const fromUrl = useUrlOverride();
  return useCallback(() => {
    writeStored(undefined);
    if (!fromUrl) return;
    const { theme: _theme, ...rest } = location.search as Record<string, unknown>;
    navigate({ to: location.pathname, search: rest as never, replace: true });
  }, [fromUrl, location, navigate]);
};

// A ?theme= preview (the workbench iframe and its live link) holds for the rest of the tab's visit
// in demo mode, so in-app navigation, which drops the search param, keeps the previewed theme.
// Live mode always follows the user's saved theme and drops any preview it inherits.
export const useV4AppTheme = () => {
  const { resolvedTheme } = useTheme();
  const isLive = useIsLiveOrg();
  const fromUrl = useUrlOverride();
  const stored = useSyncExternalStore(subscribe, readStored, () => undefined);
  const clearThemeOverride = useClearThemeOverride();
  useEffect(() => {
    if (isLive) {
      if (fromUrl || readStored()) clearThemeOverride();
      return;
    }
    if (fromUrl && fromUrl !== readStored()) writeStored(fromUrl);
  }, [fromUrl, isLive, clearThemeOverride]);
  if (isLive) return resolvedTheme;
  return fromUrl ?? stored ?? resolvedTheme;
};

export const useV4ThemeChoice = (source: ThemeChangeSource) => {
  const { theme, setTheme } = useTheme();
  const isLive = useIsLiveOrg();
  const fromUrl = useUrlOverride();
  const stored = useSyncExternalStore(subscribe, readStored, () => undefined);
  const clearThemeOverride = useClearThemeOverride();
  const choose = useCallback(
    (next: Theme) => {
      clearThemeOverride();
      if (isLive) setTheme(next, source);
      else if (next !== "system") writeStored(next);
    },
    [clearThemeOverride, isLive, setTheme, source]
  );
  return { theme: isLive ? theme : (fromUrl ?? stored ?? theme), setTheme: choose };
};
