import { createFileRoute, redirect } from "@tanstack/react-router";

import { setSecretScanningActiveProjectCookie } from "@app/helpers/secretScanningActiveProject";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Secret Scanning used to live under /projects/secret-scanning/$projectId. Old links and bookmarks
// keep working: the project they named becomes the one the secret-scanning layout opens, so a link to
// an earlier project still opens that project.
export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects/secret-scanning/$projectId/$"
)({
  beforeLoad: ({ params, location }) => {
    if (UUID_RE.test(params.projectId)) {
      setSecretScanningActiveProjectCookie(params.orgId, params.projectId);
    }

    // _splat arrives decoded, and a trailing slash leaves an empty segment behind.
    const { _splat: splat } = params;
    const rest = (splat ?? "")
      .split("/")
      .filter(Boolean)
      .map((segment) => `/${encodeURIComponent(segment)}`)
      .join("");
    throw redirect({
      href: `/organizations/${params.orgId}/secret-scanning${rest}${location.searchStr}${location.hash ? `#${location.hash}` : ""}`,
      replace: true
    });
  }
});
