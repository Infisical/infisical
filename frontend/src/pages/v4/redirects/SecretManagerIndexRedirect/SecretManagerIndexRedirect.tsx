import { Navigate, useParams } from "@tanstack/react-router";

import { v4Path } from "../../links";

export const SecretManagerIndexRedirect = () => {
  const { orgId, projectId } = useParams({
    from: "/v4/organizations/$orgId/projects/secret-management/$projectId/"
  });
  return (
    <Navigate
      replace
      to={v4Path("/organizations/$orgId/projects/secret-management/$projectId/overview")}
      params={{ orgId, projectId }}
    />
  );
};
