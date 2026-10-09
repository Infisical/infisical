import { createFileRoute, redirect } from "@tanstack/react-router";

import { setCertManagerActiveProjectCookie } from "@app/helpers/certManagerActiveProject";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Certificate Manager used to live under /projects/cert-manager/$projectId. Old links and bookmarks
// keep working: the project they named becomes the active one (the cookie the backend and the
// cert-manager layout both resolve from), so a link to a legacy instance still opens that instance.
export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects/cert-manager/$projectId/$"
)({
  beforeLoad: ({ params, location }) => {
    if (UUID_RE.test(params.projectId)) {
      setCertManagerActiveProjectCookie(params.orgId, params.projectId);
    }

    // _splat arrives decoded, and a trailing slash leaves an empty segment behind.
    const rest = (params._splat ?? "")
      .split("/")
      .filter(Boolean)
      .map((segment) => `/${encodeURIComponent(segment)}`)
      .join("");
    throw redirect({
      href: `/organizations/${params.orgId}/cert-manager${rest}${location.searchStr}${location.hash ? `#${location.hash}` : ""}`,
      replace: true
    });
  }
});
