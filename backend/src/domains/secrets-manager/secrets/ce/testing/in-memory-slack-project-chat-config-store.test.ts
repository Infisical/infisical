import { randomUUID } from "node:crypto";

import { InMemorySlackProjectChatConfigStore } from "./in-memory-slack-project-chat-config-store";
import { describeSlackProjectChatConfigStoreContract } from "./slack-project-chat-config-store-contract";

describeSlackProjectChatConfigStoreContract("InMemorySlackProjectChatConfigStore", async () => ({
  store: new InMemorySlackProjectChatConfigStore(),
  newProject: async () => ({
    projectId: randomUUID(),
    integrationId: randomUUID(),
    otherIntegrationId: randomUUID()
  })
}));
