import { Navigate, useParams, useRouteContext } from "@tanstack/react-router";

import { v4Path } from "../../links";

export const LegacyAppConnectionOauthCallbackRedirect = () => {
  const { organizationId } = useRouteContext({
    from: "/v4/organization/app-connections/$appConnection/oauth/callback"
  });
  const { appConnection } = useParams({
    from: "/v4/organization/app-connections/$appConnection/oauth/callback"
  });
  return (
    <Navigate
      replace
      to={v4Path("/organizations/$orgId/app-connections/$appConnection/oauth/callback")}
      params={{ orgId: organizationId, appConnection }}
      search
    />
  );
};
