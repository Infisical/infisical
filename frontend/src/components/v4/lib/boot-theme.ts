import { defaultV4Theme, toV4Theme, v4ThemeScheme } from "./theme-registry";
import type { V4Scheme } from "./themes";

/** Storage keys the app theme reads: the shared light, dark or system preference, the named theme per scheme, and a demo preview. */
export const v4ThemeStorage = {
  shared: "infisical-theme",
  preferred: "v4-theme",
  override: "v4-theme-override"
} as const;

/** A live org route: /v4/organizations/<id> with an id other than the demo org. */
export const v4LiveOrgPath = /^\/v4\/organizations\/(?!demo(?:\/|$))[^/]+/;

const read = (storage: () => Storage, key: string) => {
  try {
    return storage().getItem(key);
  } catch {
    return null;
  }
};

/**
 * The v4 theme for a location, from storage alone, for UI that renders before V4Scope and the
 * React theme provider: a ?theme= or session preview outside live orgs, else the person's named
 * theme for the scheme their shared preference resolves to.
 */
export const readV4BootTheme = (
  location: Pick<Location, "pathname" | "search"> = window.location
): string => {
  if (!v4LiveOrgPath.test(location.pathname)) {
    const preview =
      toV4Theme(new URLSearchParams(location.search).get("theme")) ??
      toV4Theme(read(() => window.sessionStorage, v4ThemeStorage.override));
    if (preview) return preview;
  }
  const shared = read(() => window.localStorage, v4ThemeStorage.shared);
  const choice = shared === "light" || shared === "dark" || shared === "system" ? shared : "dark";
  const systemLight =
    choice === "system" && window.matchMedia("(prefers-color-scheme: light)").matches;
  const scheme: V4Scheme = choice === "light" || systemLight ? "light" : "dark";
  let preferred: Partial<Record<V4Scheme, unknown>> = {};
  try {
    preferred = JSON.parse(read(() => window.localStorage, v4ThemeStorage.preferred) || "{}");
  } catch {
    preferred = {};
  }
  const named = toV4Theme(preferred[scheme]);
  return named && v4ThemeScheme(named) === scheme ? named : defaultV4Theme[scheme];
};
