import { Navigate, useRouteContext } from "@tanstack/react-router";

import { v4Path } from "../../links";

export const LegacyGitHubManifestCallbackRedirect = () => {
  const { organizationId } = useRouteContext({
    from: "/v4/organization/app-connections/github/manifest/callback"
  });
  return (
    <Navigate
      replace
      to={v4Path("/organizations/$orgId/app-connections/github/manifest/callback")}
      params={{ orgId: organizationId }}
      search
    />
  );
};
