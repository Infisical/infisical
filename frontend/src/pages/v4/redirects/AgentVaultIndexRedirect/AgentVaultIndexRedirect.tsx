import { Navigate, useParams } from "@tanstack/react-router";

export const AgentVaultIndexRedirect = () => {
  const { orgId } = useParams({ from: "/v4/organizations/$orgId/agent-vault/" });
  return (
    <Navigate
      replace
      to="/v4/organizations/$orgId/$"
      params={{ orgId, _splat: "agent-vault/sessions" }}
    />
  );
};
