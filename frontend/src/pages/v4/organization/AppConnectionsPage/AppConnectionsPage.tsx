import { Loader } from "@infisical/cipher/ui/loader";
import { Navigate, useParams, useSearch } from "@tanstack/react-router";

import { PageTitle } from "@app/components/PageTitle";
import { IntegrationsListPageTabs } from "@app/types/integrations";

import { v4Path } from "../../links";

const route = v4Path("/organizations/$orgId/app-connections/");

export const AppConnectionsPage = () => {
  const { orgId } = useParams({ from: route });
  const search = useSearch({ from: route });
  return (
    <>
      <PageTitle title="App connections" />
      <Loader size="page" label="Opening integrations" />
      <Navigate
        to={v4Path("/organizations/$orgId/integrations")}
        params={{ orgId }}
        search={{ ...search, selectedTab: IntegrationsListPageTabs.AppConnections }}
        replace
      />
    </>
  );
};
