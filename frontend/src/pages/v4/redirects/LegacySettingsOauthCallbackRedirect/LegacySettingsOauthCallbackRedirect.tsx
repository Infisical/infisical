import { Navigate, useRouteContext } from "@tanstack/react-router";

import { v4Path } from "../../links";

export const LegacySettingsOauthCallbackRedirect = () => {
  const { organizationId } = useRouteContext({ from: "/v4/organization/settings/oauth/callback" });
  return (
    <Navigate
      replace
      to={v4Path("/organizations/$orgId/settings/oauth/callback")}
      params={{ orgId: organizationId }}
      search
    />
  );
};
