import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@app/components/v3";
import { useGetAdminIntegrationsConfig } from "@app/hooks/api";
import { AdminIntegrationsConfig } from "@app/hooks/api/admin/types";

import { MicrosoftTeamsIntegrationForm } from "./MicrosoftTeamsIntegrationForm";
import { SlackIntegrationForm } from "./SlackIntegrationForm";

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

  return (
    <Card className="min-h-64 gap-0 overflow-hidden p-0">
      <CardHeader className="p-6">
        <CardTitle>Integrations</CardTitle>
        <CardDescription>
          Configure your instance-wide settings to enable integration with third-party services.
        </CardDescription>
      </CardHeader>
      <CardContent className="px-6 pb-6">
        <WorkflowTab adminIntegrationsConfig={adminIntegrationsConfig!} />
      </CardContent>
    </Card>
  );
};
