import { poolStoreConnection } from "@app/domains/lib/data-access";
import { setupIntegration } from "@app/domains/lib/testing/integration";

import { describeMicrosoftTeamsProjectChatConfigStoreContract } from "../testing/microsoft-teams-project-chat-config-store-contract";
import { seedWorkflowIntegrations } from "../testing/seed-workflow-integrations";
import { MicrosoftTeamsProjectChatConfigStore } from "./microsoft-teams-project-chat-config-store";

const h = setupIntegration();

describeMicrosoftTeamsProjectChatConfigStoreContract("MicrosoftTeamsProjectChatConfigStore", async () => {
  const integrations = await seedWorkflowIntegrations(h.db);
  return {
    store: new MicrosoftTeamsProjectChatConfigStore(poolStoreConnection(h.db)),
    newProject: async () => {
      const tenant = await h.newTenant();
      return {
        projectId: tenant.project.id,
        integrationId: await integrations.microsoftTeams(tenant.org.id),
        otherIntegrationId: await integrations.microsoftTeams(tenant.org.id)
      };
    }
  };
});
