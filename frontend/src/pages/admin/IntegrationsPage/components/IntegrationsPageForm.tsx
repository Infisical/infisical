import { useNavigate, useSearch } from "@tanstack/react-router";

import { Tab, TabList, TabPanel, Tabs } from "@app/components/v2";
import { ROUTE_PATHS } from "@app/const/routes";
import { useGetAdminIntegrationsConfig } from "@app/hooks/api";
import { AdminIntegrationsConfig } from "@app/hooks/api/admin/types";

import { GovSlackIntegrationForm } from "./GovSlackIntegrationForm";
import { MicrosoftTeamsIntegrationForm } from "./MicrosoftTeamsIntegrationForm";
import { SlackIntegrationForm } from "./SlackIntegrationForm";

enum IntegrationTabSections {
  Workflow = "workflow"
}

interface WorkflowTabProps {
  adminIntegrationsConfig: AdminIntegrationsConfig;
}

const WorkflowTab = ({ adminIntegrationsConfig }: WorkflowTabProps) => (
  <div className="flex flex-col gap-2">
    <SlackIntegrationForm adminIntegrationsConfig={adminIntegrationsConfig} />
    <GovSlackIntegrationForm adminIntegrationsConfig={adminIntegrationsConfig} />
    <MicrosoftTeamsIntegrationForm adminIntegrationsConfig={adminIntegrationsConfig} />
  </div>
);

export const IntegrationsPageForm = () => {
  const { data: adminIntegrationsConfig } = useGetAdminIntegrationsConfig();

  const navigate = useNavigate({
    from: ROUTE_PATHS.Admin.IntegrationsPage.path
  });

  const selectedTab = useSearch({
    from: ROUTE_PATHS.Admin.IntegrationsPage.id,
    select: (el: { selectedTab?: string }) => el.selectedTab || IntegrationTabSections.Workflow,
    structuralSharing: true
  });

  const updateSelectedTab = (tab: string) => {
    navigate({
      search: { selectedTab: tab }
    });
  };

  const tabSections = [
    {
      key: IntegrationTabSections.Workflow,
      label: "Workflows",
      component: WorkflowTab
    }
  ];

  return (
    <div className="mb-6 min-h-64 rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
      <div className="mb-4">
        <div className="text-xl font-medium text-mineshaft-100">Integrations</div>
        <div className="text-sm text-mineshaft-300">
          Configure your instance-wide settings to enable integration with third-party services.
        </div>
      </div>
      <Tabs value={selectedTab} onValueChange={updateSelectedTab}>
        <TabList>
          {tabSections.map((section) => (
            <Tab value={section.key} key={`integration-tab-${section.key}`}>
              {section.label}
            </Tab>
          ))}
        </TabList>
        {tabSections.map(({ key, component: Component }) => (
          <TabPanel value={key} key={`integration-tab-panel-${key}`}>
            <Component adminIntegrationsConfig={adminIntegrationsConfig!} />
          </TabPanel>
        ))}
      </Tabs>
    </div>
  );
};
