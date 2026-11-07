import { isRedirect, type ParsedLocation } from "@tanstack/react-router";

import { toV3Href, toV4Href } from "@app/helpers/v4Bridge";

export const toV3Location = (location: ParsedLocation): ParsedLocation => ({
  ...location,
  pathname: toV3Href(location.pathname),
  href: toV3Href(location.href)
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

export const v4LoginPath = "/v4/login" as const;
