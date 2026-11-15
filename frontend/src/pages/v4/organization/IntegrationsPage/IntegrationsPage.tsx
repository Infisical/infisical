import { Stack } from "@infisical/cipher/ui/layout";
import { PageHeader } from "@infisical/cipher/ui/page-header";
import { Tabs } from "@infisical/cipher/ui/tabs";
import { Navigate, useNavigate, useParams, useSearch } from "@tanstack/react-router";

import { PageTitle } from "@app/components/PageTitle";
import { IntegrationsListPageTabs } from "@app/types/integrations";

import { AppConnectionsTable } from "../../integrations/app-connections-table";
import { orgHref, v4Path } from "../../links";
import { ExternalMigrationsTab } from "./external-migrations";
import { WorkflowIntegrationsTab } from "./workflow-integrations";

const route = v4Path("/organizations/$orgId/integrations");
const workflowTab = "workflow-integrations";
const migrationsTab = "external-migrations";
const sections = [IntegrationsListPageTabs.AppConnections, workflowTab, migrationsTab] as string[];

export const IntegrationsPage = () => {
  const navigate = useNavigate({ from: route });
  const { selectedTab } = useSearch({ from: route });
  const tab = sections.includes(selectedTab)
    ? selectedTab
    : IntegrationsListPageTabs.AppConnections;
  const { orgId } = useParams({ from: route });
  if (selectedTab === "oauth-applications")
    return (
      <Navigate
        to={v4Path("/organizations/$orgId/oauth-applications")}
        params={{ orgId }}
        replace
      />
    );
  return (
    <Stack gap={24}>
      <PageTitle title="Integrations" />
      <PageHeader
        title="Integrations"
        tabs={
          <Tabs
            label="Integration sections"
            value={tab}
            onChange={(value) => navigate({ search: (prev) => ({ ...prev, selectedTab: value }) })}
            tabs={[
              {
                value: IntegrationsListPageTabs.AppConnections,
                label: "App connections",
                content: null
              },
              { value: workflowTab, label: "Workflow integrations", content: null },
              { value: migrationsTab, label: "External migrations", content: null }
            ]}
          />
        }
      />
      {tab === IntegrationsListPageTabs.AppConnections && (
        <AppConnectionsTable
          scope={{ kind: "org" }}
          returnTo={orgHref(
            orgId,
            `/integrations?selectedTab=${IntegrationsListPageTabs.AppConnections}`
          )}
        />
      )}
      {tab === workflowTab && <WorkflowIntegrationsTab />}
      {tab === migrationsTab && <ExternalMigrationsTab />}
    </Stack>
  );
};
