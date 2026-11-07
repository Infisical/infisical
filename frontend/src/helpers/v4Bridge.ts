import { type AnyRouter, redirect } from "@tanstack/react-router";

import { isV4AppEnabled } from "./v4AppFlag";

export type V4Readiness = "full" | "partial" | "none";

declare module "@tanstack/react-router" {
  interface StaticDataRouteOption {
    readiness?: V4Readiness;
    missing?: string[];
    v3Alias?: boolean;
  }
}

type BridgeMatch = {
  routeId: string;
  globalNotFound?: boolean;
  staticData?: { readiness?: V4Readiness; v3Alias?: boolean };
};

const V4_PREFIX = "/v4";
const CLASSIC_KEY = "v4-classic-paths";

let bridgeRouter: AnyRouter | undefined;

export const registerV4BridgeRouter = (router: AnyRouter) => {
  bridgeRouter = router;
};

const pathOf = (href: string) => href.split(/[?#]/)[0].replace(/(.)\/$/, "$1");

const matchesOf = (pathname: string): readonly BridgeMatch[] =>
  bridgeRouter ? bridgeRouter.matchRoutes(pathname, {}) : [];

export const v4Readiness = (matches: readonly BridgeMatch[]): V4Readiness => {
  const leaf = matches.at(-1);
  if (!leaf || leaf.routeId.endsWith("/$") || matches.some((match) => match.globalNotFound))
    return "none";
  return leaf.staticData?.readiness ?? "none";
};

export const isV4Href = (href: string) => /^\/v4(?:[/?#]|$)/.test(href);

export const toV3Href = (href: string) =>
  isV4Href(href) ? href.slice(V4_PREFIX.length) || "/" : href;

export const v4ReadinessOf = (v4Href: string) => v4Readiness(matchesOf(pathOf(v4Href)));

export const hasV4Page = (v4Href: string) => v4ReadinessOf(v4Href) !== "none";

export const hasV3Page = (v3Href: string) => {
  const matches = matchesOf(pathOf(v3Href));
  return matches.length > 0 && !matches.some((match) => match.globalNotFound);
};

export const toV4Href = (href: string) =>
  !isV4Href(href) && hasV4Page(`${V4_PREFIX}${href}`) ? `${V4_PREFIX}${href}` : href;

export const resolveV4Href = (href: string) =>
  isV4Href(href) && !hasV4Page(href) ? toV3Href(href) : href;

const classicPaths = (): string[] => {
  try {
    const stored = JSON.parse(window.sessionStorage.getItem(CLASSIC_KEY) ?? "[]");
    return Array.isArray(stored) ? stored : [];
  } catch {
    return [];
  }
};

export const keepInClassic = (v3Href: string) => {
  try {
    window.sessionStorage.setItem(
      CLASSIC_KEY,
      JSON.stringify([...new Set([...classicPaths(), pathOf(v3Href)])])
    );
    return true;
  } catch {
    return false;
  }
};

export const handoffToV4 = async (location: { pathname: string; href: string }) => {
  if (matchesOf(pathOf(location.pathname)).at(-1)?.staticData?.v3Alias) return;
  if (classicPaths().includes(pathOf(location.pathname))) return;
  if (!hasV4Page(`${V4_PREFIX}${location.pathname}`)) return;
  if (!(await isV4AppEnabled())) return;
  throw redirect({ href: `${V4_PREFIX}${location.href}`, replace: true });
};
