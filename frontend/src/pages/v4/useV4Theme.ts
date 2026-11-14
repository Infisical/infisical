import { useCallback, useEffect, useSyncExternalStore } from "react";
import { defaultTheme, toTheme, themeScheme } from "@infisical/cipher/lib/theme-registry";
import type { Scheme } from "@infisical/cipher/lib/themes";
import { useNavigate, useParams, useRouterState } from "@tanstack/react-router";

import {
  type ThemeChangeSource,
  useTheme
} from "@app/components/v3/platform/ThemeProvider/ThemeProvider";

import { V4_DEMO_ORG_ID } from "./mode";

export type V4ThemeChoice = string;

const KEY = "v4-theme-override";
const PREFERRED_KEY = "v4-theme";
const listeners = new Set<() => void>();

const readStored = (): string | undefined => {
  try {
    return toTheme(window.sessionStorage.getItem(KEY));
  } catch {
    return undefined;
  }
};

const notify = () => listeners.forEach((listener) => listener());

const writeStored = (value: string | undefined) => {
  try {
    if (value) window.sessionStorage.setItem(KEY, value);
    else window.sessionStorage.removeItem(KEY);
  } catch {
    return;
  }
  notify();
};

const readPreferredRaw = () => {
  try {
    return window.localStorage.getItem(PREFERRED_KEY) ?? "";
  } catch {
    return "";
  }
};

// The live app keeps light, dark or system in the shared theme preference; this remembers which
// named theme of each scheme the person picked, so System and the scheme can resolve to it.
const parsePreferred = (raw: string): Record<Scheme, string> => {
  let stored: Partial<Record<Scheme, unknown>> = {};
  try {
    stored = raw ? (JSON.parse(raw) as typeof stored) : {};
  } catch {
    stored = {};
  }
  const pick = (scheme: Scheme) => {
    const theme = toTheme(stored[scheme]);
    return theme && themeScheme(theme) === scheme ? theme : defaultTheme[scheme];
  };
  return { light: pick("light"), dark: pick("dark") };
};

const writePreferred = (theme: string) => {
  try {
    const next = { ...parsePreferred(readPreferredRaw()), [themeScheme(theme)]: theme };
    window.localStorage.setItem(PREFERRED_KEY, JSON.stringify(next));
  } catch {
    return;
  }
  notify();
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

const usePreferred = () =>
  parsePreferred(useSyncExternalStore(subscribe, readPreferredRaw, () => ""));

const useUrlOverride = () =>
  useRouterState({
    select: (state): string | undefined =>
      toTheme((state.location.search as { theme?: unknown }).theme)
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
  const preferred = usePreferred();
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
  if (isLive) return preferred[resolvedTheme];
  return fromUrl ?? stored ?? preferred[resolvedTheme];
};

export const useV4ThemeChoice = (source: ThemeChangeSource) => {
  const { theme, resolvedTheme, setTheme } = useTheme();
  const preferred = usePreferred();
  const isLive = useIsLiveOrg();
  const fromUrl = useUrlOverride();
  const stored = useSyncExternalStore(subscribe, readStored, () => undefined);
  const clearThemeOverride = useClearThemeOverride();
  const choose = useCallback(
    (next: V4ThemeChoice) => {
      clearThemeOverride();
      if (next === "system") {
        if (isLive) setTheme("system", source);
        return;
      }
      const named = toTheme(next);
      if (!named) return;
      if (isLive) {
        writePreferred(named);
        setTheme(themeScheme(named), source);
      } else writeStored(named);
    },
    [clearThemeOverride, isLive, setTheme, source]
  );
  const saved = theme === "system" ? "system" : preferred[resolvedTheme];
  return { theme: isLive ? saved : (fromUrl ?? stored ?? saved), setTheme: choose };
};
