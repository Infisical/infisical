import { randomUUID } from "node:crypto";

import { InMemoryMicrosoftTeamsProjectChatConfigStore } from "./in-memory-microsoft-teams-project-chat-config-store";
import { describeMicrosoftTeamsProjectChatConfigStoreContract } from "./microsoft-teams-project-chat-config-store-contract";

describeMicrosoftTeamsProjectChatConfigStoreContract("InMemoryMicrosoftTeamsProjectChatConfigStore", async () => ({
  store: new InMemoryMicrosoftTeamsProjectChatConfigStore(),
  newProject: async () => ({
    projectId: randomUUID(),
    integrationId: randomUUID(),
    otherIntegrationId: randomUUID()
  })
}));
