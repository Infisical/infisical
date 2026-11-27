import { useEffect, useRef } from "react";
import { Loader } from "@infisical/cipher/ui/loader";
import { useNavigate, useParams, useSearch } from "@tanstack/react-router";

import { PageTitle } from "@app/components/PageTitle";
import { AppConnection } from "@app/hooks/api/appConnections/enums";

import { toast } from "../../access/toast";
import { v4Path } from "../../links";
import { integrationName, SECRET_SYNCS_TAB } from "../IntegrationsPage/native-model";
import {
  SECRET_SYNCS_PATH,
  syncDestinationOf
} from "../LegacyIntegrationRedirect/legacy-integration";

const ROUTE = v4Path(
  "/organizations/$orgId/projects/secret-management/$projectId/integrations/$provider/oauth2/callback"
);

const APP_CONNECTION_CALLBACKS: Partial<Record<string, AppConnection>> = {
  gitlab: AppConnection.GitLab,
  heroku: AppConnection.Heroku
};

export const IntegrationOauthCallbackPage = () => {
  const { orgId, projectId, provider } = useParams({ from: ROUTE });
  const search = useSearch({ from: ROUTE });
  const navigate = useNavigate();
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    const appConnection = APP_CONNECTION_CALLBACKS[provider];
    if (appConnection) {
      navigate({
        to: v4Path("/organizations/$orgId/app-connections/$appConnection/oauth/callback"),
        params: { orgId, appConnection },
        search: {
          code: search.code,
          state: provider === "gitlab" ? search.state.split("|", 1)[0] : search.state
        },
        replace: true
      });
      return;
    }

    const destination = syncDestinationOf(provider);
    const name = integrationName(provider);
    navigate({
      to: SECRET_SYNCS_PATH,
      params: { orgId, projectId },
      search: { selectedTab: SECRET_SYNCS_TAB, addSync: destination },
      replace: true
    }).then(() =>
      toast({
        title: destination ? `Connect ${name} with a secret sync` : "Use a secret sync instead",
        description:
          "Native integrations can no longer be created, so this authorization wasn't saved."
      })
    );
  }, [navigate, orgId, projectId, provider, search]);

  return (
    <>
      <PageTitle title="Connecting integration" />
      <Loader size="page" label="Connecting" />
    </>
  );
};
