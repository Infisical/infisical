import { Navigate, useParams } from "@tanstack/react-router";

import { v4Path } from "../../links";

export const PamIndexRedirect = () => {
  const { orgId } = useParams({ from: "/v4/organizations/$orgId/pam/" });
  return <Navigate replace to={v4Path("/organizations/$orgId/pam/accounts")} params={{ orgId }} />;
};
