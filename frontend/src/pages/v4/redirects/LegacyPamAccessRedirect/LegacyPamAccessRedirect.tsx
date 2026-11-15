import { Navigate, useRouteContext } from "@tanstack/react-router";

import { v4Path } from "../../links";

export const LegacyPamAccessRedirect = () => {
  const { organizationId } = useRouteContext({ from: "/v4/pam/access" });
  return (
    <Navigate
      replace
      to={v4Path("/organizations/$orgId/pam/accounts")}
      params={{ orgId: organizationId }}
    />
  );
};
