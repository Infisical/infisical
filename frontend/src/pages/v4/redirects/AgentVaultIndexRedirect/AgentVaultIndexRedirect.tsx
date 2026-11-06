import { Navigate, useParams } from "@tanstack/react-router";

export const AgentVaultIndexRedirect = () => {
  const { orgId, projectId } = useParams({
    from: "/v4/organizations/$orgId/projects/agent-vault/$projectId/"
  });
  return (
    <Navigate
      replace
      to="/v4/organizations/$orgId/projects/agent-vault/$projectId/sessions"
      params={{ orgId, projectId }}
    />
  );
};
