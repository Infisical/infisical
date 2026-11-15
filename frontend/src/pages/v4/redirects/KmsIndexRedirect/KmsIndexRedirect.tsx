import { Navigate, useParams } from "@tanstack/react-router";

import { v4Path } from "../../links";

export const KmsIndexRedirect = () => {
  const { orgId, projectId } = useParams({
    from: "/v4/organizations/$orgId/projects/kms/$projectId/"
  });
  return (
    <Navigate
      replace
      to={v4Path("/organizations/$orgId/projects/kms/$projectId/overview")}
      params={{ orgId, projectId }}
    />
  );
};
