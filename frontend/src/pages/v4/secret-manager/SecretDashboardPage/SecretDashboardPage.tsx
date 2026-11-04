import { Navigate, useParams, useSearch } from "@tanstack/react-router";

import { withoutDefaults } from "../search-defaults";

export const SecretDashboardPage = () => {
  const params = useParams({
    from: "/v4/organizations/$orgId/projects/secret-management/$projectId/secrets/$envSlug"
  });
  const search = useSearch({
    from: "/v4/organizations/$orgId/projects/secret-management/$projectId/secrets/$envSlug"
  });
  return (
    <Navigate
      replace
      to="/v4/organizations/$orgId/projects/secret-management/$projectId/overview"
      params={{ orgId: params.orgId, projectId: params.projectId }}
      search={withoutDefaults(
        {
          secretPath: search.secretPath,
          search: search.search,
          tags: search.tags || undefined,
          filterBy: search.filterBy || undefined,
          connectionId: search.connectionId,
          connectionName: search.connectionName,
          dynamicSecretId: search.dynamicSecretId || undefined,
          environments: [params.envSlug]
        },
        { secretPath: "/", search: "" }
      )}
    />
  );
};
