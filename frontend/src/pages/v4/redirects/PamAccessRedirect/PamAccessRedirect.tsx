import { Navigate, useParams } from "@tanstack/react-router";

export const PamAccessRedirect = () => {
  const { orgId } = useParams({ from: "/v4/organizations/$orgId/pam/access" });
  return (
    <Navigate replace to="/v4/organizations/$orgId/$" params={{ orgId, _splat: "pam/accounts" }} />
  );
};
