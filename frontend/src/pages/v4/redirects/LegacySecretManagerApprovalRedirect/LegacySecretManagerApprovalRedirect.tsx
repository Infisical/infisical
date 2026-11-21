import { Navigate, useParams } from "@tanstack/react-router";

import { v4Path } from "../../links";

export const LegacySecretManagerApprovalRedirect = () => {
  const { orgId, projectId } = useParams({
    from: "/v4/organizations/$orgId/secret-manager/$projectId/approval"
  });
  return (
    <Navigate
      replace
      to={v4Path("/organizations/$orgId/projects/secret-management/$projectId/approval")}
      params={{ orgId, projectId }}
      search
    />
  );
};
