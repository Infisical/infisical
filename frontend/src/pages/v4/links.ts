import { useNavigate } from "@tanstack/react-router";

import { useResolveV4Href } from "./resolveV4Href";

const V4_PREFIX = "/v4";

export const v4Path = <const P extends string>(path: P) => `${V4_PREFIX}${path}` as `/v4${P}`;

export const orgHref = (orgId: string, path = "") => `${V4_PREFIX}/organizations/${orgId}${path}`;

export const useGo = () => {
  const navigate = useNavigate();
  const resolve = useResolveV4Href();
  const go = (href: string) => navigate({ href: resolve(href) });
  const link = (href?: string) => {
    const [path, query] = href ? resolve(href).split("?") : [];
    return {
      to: path as never,
      search: (query ? Object.fromEntries(new URLSearchParams(query)) : undefined) as never,
      disabled: !href
    };
  };
  return Object.assign(go, { link });
};
