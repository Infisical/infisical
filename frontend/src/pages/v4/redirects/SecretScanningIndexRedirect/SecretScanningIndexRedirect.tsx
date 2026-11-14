import { Navigate, useParams } from "@tanstack/react-router";

import { v4Path } from "../../links";

export const SecretScanningIndexRedirect = () => {
  const { orgId } = useParams({ from: "/v4/organizations/$orgId/secret-scanning/" });
  return (
    <Navigate
      replace
      to={v4Path("/organizations/$orgId/secret-scanning/data-sources")}
      params={{ orgId }}
    />
  );
};
