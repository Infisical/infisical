import { useGetAdminIntegrationsConfig } from "@app/hooks/api";

import { MicrosoftTeamsIntegrationForm } from "./MicrosoftTeamsIntegrationForm";
import { SlackIntegrationForm } from "./SlackIntegrationForm";

export const IntegrationPanel = () => {
  const { data: adminIntegrationsConfig } = useGetAdminIntegrationsConfig();

  return (
    <div className="mb-6 min-h-64 rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
      <div className="mb-4">
        <div className="text-xl font-semibold text-mineshaft-100">Integrations</div>
        <div className="text-sm text-mineshaft-300">
          Configure your instance-wide settings to enable integration with Slack and Microsoft
          Teams.
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <SlackIntegrationForm adminIntegrationsConfig={adminIntegrationsConfig} />
        <MicrosoftTeamsIntegrationForm adminIntegrationsConfig={adminIntegrationsConfig} />
      </div>
    </div>
  );
};
