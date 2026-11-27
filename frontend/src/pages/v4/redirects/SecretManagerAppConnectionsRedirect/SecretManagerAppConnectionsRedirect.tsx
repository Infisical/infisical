import { Navigate, useParams, useSearch } from "@tanstack/react-router";

import { v4Path } from "../../links";

const route = v4Path("/organizations/$orgId/projects/secret-management/$projectId/app-connections");

export const SecretManagerAppConnectionsRedirect = () => {
  const { orgId, projectId } = useParams({ from: route });
  const search = useSearch({ from: route });
  return (
    <Navigate
      replace
      to={v4Path("/organizations/$orgId/projects/secret-management/$projectId/integrations")}
      params={{ orgId, projectId }}
      search={{ ...search, selectedTab: "app-connections" }}
    />
  );
};
