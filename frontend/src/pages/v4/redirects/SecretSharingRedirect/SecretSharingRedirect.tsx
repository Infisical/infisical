import { Navigate, useParams } from "@tanstack/react-router";

import { v4Path } from "../../links";

export const SecretSharingRedirect = () => {
  const { orgId } = useParams({ from: "/v4/organizations/$orgId/secret-sharing" });
  return (
    <Navigate
      replace
      to={v4Path("/organizations/$orgId/projects/secret-management/secret-sharing")}
      params={{ orgId }}
      search
    />
  );
};
