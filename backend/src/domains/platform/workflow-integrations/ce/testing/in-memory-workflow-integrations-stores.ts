import { TStoreLocks } from "@app/domains/lib/transactions";
import { InMemoryTransactionRunner } from "@app/domains/lib/transactions/testing/in-memory-transaction-runner";

import { TWorkflowIntegrationsStores } from "../services/dependencies";
import { InMemoryWorkflowIntegrationStore } from "./in-memory-workflow-integration-store";

// Workflow Integrations' stores in memory: one state behind the transaction runner and the store used outside a
// transaction.
export class InMemoryWorkflowIntegrationsStores {
  readonly workflowIntegrationStore = new InMemoryWorkflowIntegrationStore();

  readonly transactionRunner: InMemoryTransactionRunner<TWorkflowIntegrationsStores>;

  constructor() {
    this.transactionRunner = new InMemoryTransactionRunner<TWorkflowIntegrationsStores>(this, (locks: TStoreLocks) => ({
      workflowIntegrationStore: this.workflowIntegrationStore,
      locks
    }));
  }

  snapshot(): unknown {
    return this.workflowIntegrationStore.snapshot();
  }

  restore(snapshot: unknown) {
    this.workflowIntegrationStore.restore(snapshot);
  }
}
