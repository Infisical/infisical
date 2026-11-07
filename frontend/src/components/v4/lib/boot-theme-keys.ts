/** Storage keys the app theme reads: the shared light, dark or system preference, the named theme per scheme, and a demo preview. */
export const v4ThemeStorage = {
  shared: "infisical-theme",
  preferred: "v4-theme",
  override: "v4-theme-override"
} as const;

/** A live org route: /v4/organizations/<id> with an id other than the demo org. */
export const v4LiveOrgPath = /^\/v4\/organizations\/(?!demo(?:\/|$))[^/]+/;
