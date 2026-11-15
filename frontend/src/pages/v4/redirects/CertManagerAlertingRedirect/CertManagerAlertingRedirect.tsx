import { Navigate, useParams } from "@tanstack/react-router";

import { v4Path } from "../../links";

export const CertManagerAlertingRedirect = () => {
  const { orgId } = useParams({ from: "/v4/organizations/$orgId/cert-manager/alerting" });
  return (
    <Navigate
      replace
      to={v4Path("/organizations/$orgId/cert-manager/settings")}
      params={{ orgId }}
      search={{ selectedTab: "alerts" }}
    />
  );
};
