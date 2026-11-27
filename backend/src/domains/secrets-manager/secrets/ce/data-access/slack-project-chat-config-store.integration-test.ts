import { poolStoreConnection } from "@app/domains/lib/data-access";
import { setupIntegration } from "@app/domains/lib/testing/integration";

import { seedWorkflowIntegrations } from "../testing/seed-workflow-integrations";
import { describeSlackProjectChatConfigStoreContract } from "../testing/slack-project-chat-config-store-contract";
import { SlackProjectChatConfigStore } from "./slack-project-chat-config-store";

const h = setupIntegration();

describeSlackProjectChatConfigStoreContract("SlackProjectChatConfigStore", async () => {
  const integrations = await seedWorkflowIntegrations(h.db);
  return {
    store: new SlackProjectChatConfigStore(poolStoreConnection(h.db)),
    newProject: async () => {
      const tenant = await h.newTenant();
      return {
        projectId: tenant.project.id,
        integrationId: await integrations.slack(tenant.org.id),
        otherIntegrationId: await integrations.slack(tenant.org.id)
      };
    }
  };
});
