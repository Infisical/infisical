import { Navigate, useParams, useSearch } from "@tanstack/react-router";

import { v4Path } from "../../links";
import { SECRET_SYNCS_TAB } from "../IntegrationsPage/native-model";
import { SECRET_SYNCS_PATH, syncDestinationOf } from "./legacy-integration";

const ToSecretSyncs = ({
  orgId,
  projectId,
  provider
}: {
  orgId: string;
  projectId: string;
  provider?: string;
}) => (
  <Navigate
    replace
    to={SECRET_SYNCS_PATH}
    params={{ orgId, projectId }}
    search={{ selectedTab: SECRET_SYNCS_TAB, addSync: syncDestinationOf(provider) }}
  />
);

export const LegacyIntegrationAuthorizeRedirect = () => {
  const params = useParams({
    from: v4Path(
      "/organizations/$orgId/projects/secret-management/$projectId/integrations/$provider/authorize"
    )
  });
  return <ToSecretSyncs {...params} />;
};

export const LegacyIntegrationCreateRedirect = () => {
  const params = useParams({
    from: v4Path(
      "/organizations/$orgId/projects/secret-management/$projectId/integrations/$provider/create"
    )
  });
  return <ToSecretSyncs {...params} />;
};

export const GithubAuthModeRedirect = () => {
  const params = useParams({
    from: v4Path(
      "/organizations/$orgId/projects/secret-management/$projectId/integrations/github/auth-mode-selection"
    )
  });
  return <ToSecretSyncs {...params} provider="github" />;
};

const SELECT_AUTH_ROUTE = v4Path(
  "/organizations/$orgId/projects/secret-management/$projectId/integrations/select-integration-auth"
);

export const SelectIntegrationAuthRedirect = () => {
  const params = useParams({ from: SELECT_AUTH_ROUTE });
  const { integrationSlug } = useSearch({ from: SELECT_AUTH_ROUTE });
  return <ToSecretSyncs {...params} provider={integrationSlug} />;
};
