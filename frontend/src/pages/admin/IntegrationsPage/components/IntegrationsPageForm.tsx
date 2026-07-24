import { useNavigate, useSearch } from "@tanstack/react-router";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger
} from "@app/components/v3";
import { ROUTE_PATHS } from "@app/const/routes";
import { useGetAdminIntegrationsConfig } from "@app/hooks/api";
import { AdminIntegrationsConfig } from "@app/hooks/api/admin/types";

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
    <Card className="min-h-64">
      <CardHeader>
        <CardTitle>Integrations</CardTitle>
        <CardDescription>
          Configure your instance-wide settings to enable integration with third-party services.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs value={selectedTab} onValueChange={updateSelectedTab}>
          <TabsList variant="admin">
            {tabSections.map((section) => (
              <TabsTrigger value={section.key} key={`integration-tab-${section.key}`}>
                {section.label}
              </TabsTrigger>
            ))}
          </TabsList>
          {tabSections.map(({ key, component: Component }) => (
            <TabsContent value={key} key={`integration-tab-panel-${key}`}>
              <Component adminIntegrationsConfig={adminIntegrationsConfig!} />
            </TabsContent>
          ))}
        </Tabs>
      </CardContent>
    </Card>
  );
};
