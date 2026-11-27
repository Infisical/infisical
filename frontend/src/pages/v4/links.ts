import { useNavigate, useRouterState } from "@tanstack/react-router";

import { useResolveV4Href } from "./resolveV4Href";

const V4_PREFIX = "/v4";

export const v4Path = <const P extends string>(path: P) => `${V4_PREFIX}${path}` as `/v4${P}`;

export const orgHref = (orgId: string, path = "") => `${V4_PREFIX}/organizations/${orgId}${path}`;

export const certificateHref = (
  orgId: string,
  certificateId: string,
  { applicationName }: { applicationName?: string } = {}
) =>
  orgHref(
    orgId,
    applicationName
      ? `/cert-manager/applications/${encodeURIComponent(applicationName)}/certificates/${certificateId}`
      : `/cert-manager/certificates/${certificateId}`
  );

export const useGo = () => {
  const navigate = useNavigate();
  const resolveHref = useResolveV4Href();
  const scenario = useRouterState({
    select: (state) => (state.location.search as { scenario?: unknown }).scenario
  });
  const resolve = (href: string) => {
    const resolved = resolveHref(href);
    if (typeof scenario !== "string" || /[?&]scenario=/.test(resolved)) return resolved;
    return `${resolved}${resolved.includes("?") ? "&" : "?"}scenario=${encodeURIComponent(scenario)}`;
  };
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
