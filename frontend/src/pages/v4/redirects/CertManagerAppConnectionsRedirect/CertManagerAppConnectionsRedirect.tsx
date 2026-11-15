import { Navigate, useParams } from "@tanstack/react-router";

import { v4Path } from "../../links";

export const CertManagerAppConnectionsRedirect = () => {
  const { orgId } = useParams({ from: "/v4/organizations/$orgId/cert-manager/app-connections" });
  return (
    <Navigate
      replace
      to={v4Path("/organizations/$orgId/cert-manager/settings")}
      params={{ orgId }}
      search={{ selectedTab: "app-connections" }}
    />
  );
};
