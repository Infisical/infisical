import { InMemoryWorkflowIntegrationStore } from "./in-memory-workflow-integration-store";
import { describeWorkflowIntegrationStoreContract } from "./workflow-integration-store-contract";

describeWorkflowIntegrationStoreContract("InMemoryWorkflowIntegrationStore", async () => ({
  store: new InMemoryWorkflowIntegrationStore(),
  newOrgId: async () => crypto.randomUUID()
}));
