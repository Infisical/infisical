import { isRedirect, type ParsedLocation } from "@tanstack/react-router";

import { isLiveReady } from "../liveReady";

const AUTH_PATHS = new Set([
  "/login",
  "/login/admin",
  "/login/select-organization",
  "/login/ldap",
  "/login/oidc",
  "/login/saml",
  "/login/provider/error",
  "/signup",
  "/signup/sso"
]);

const pathOf = (href: string) => href.split(/[?#]/)[0].replace(/(.)\/$/, "$1");

export const hasV4Twin = (href: string) =>
  AUTH_PATHS.has(pathOf(href)) || isLiveReady(`/v4${pathOf(href)}`);

export const toV4Href = (href: string) => (hasV4Twin(href) ? `/v4${href}` : href);

export const toV3Location = (location: ParsedLocation): ParsedLocation => ({
  ...location,
  pathname: location.pathname.replace(/^\/v4/, "") || "/",
  href: location.href.replace(/^\/v4/, "")
});

// Main's guards redirect to main's paths; a target that has a v4 twin stays inside v4.
export const withV4Redirects = async <T>(guard: () => Promise<T>) => {
  try {
    return await guard();
  } catch (error) {
    if (isRedirect(error)) {
      const target = error as { to?: unknown; href?: unknown };
      if (typeof target.href === "string" && target.href.startsWith("/")) {
        target.href = toV4Href(target.href);
      } else if (typeof target.to === "string" && target.to.startsWith("/")) {
        target.to = toV4Href(target.to);
      }
    }
    throw error;
  }
};
