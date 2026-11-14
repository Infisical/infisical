import { Navigate, useParams } from "@tanstack/react-router";

import { v4Path } from "../../links";

export const PamAccessRedirect = () => {
  const { orgId } = useParams({ from: "/v4/organizations/$orgId/pam/access" });
  return (
    <Navigate
      replace
      to={v4Path("/organizations/$orgId/$")}
      params={{ orgId, _splat: "pam/accounts" }}
    />
  );
};
