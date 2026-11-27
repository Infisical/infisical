import { TStoreLocks } from "@app/domains/lib/transactions";
import { InMemoryTransactionRunner } from "@app/domains/lib/transactions/testing/in-memory-transaction-runner";

import { TSecretsStores } from "../services/dependencies";
import { InMemoryMicrosoftTeamsProjectChatConfigStore } from "./in-memory-microsoft-teams-project-chat-config-store";
import { InMemorySlackProjectChatConfigStore } from "./in-memory-slack-project-chat-config-store";

// The Secrets stores in memory: one state behind the transaction runner and the stores used outside a transaction.
export class InMemorySecretsStores {
  readonly slackProjectChatConfigStore = new InMemorySlackProjectChatConfigStore();

  readonly microsoftTeamsProjectChatConfigStore = new InMemoryMicrosoftTeamsProjectChatConfigStore();

  readonly transactionRunner: InMemoryTransactionRunner<TSecretsStores>;

  constructor() {
    this.transactionRunner = new InMemoryTransactionRunner<TSecretsStores>(this, (locks: TStoreLocks) => ({
      slackProjectChatConfigStore: this.slackProjectChatConfigStore,
      microsoftTeamsProjectChatConfigStore: this.microsoftTeamsProjectChatConfigStore,
      locks
    }));
  }

  snapshot(): unknown {
    return {
      slack: this.slackProjectChatConfigStore.snapshot(),
      microsoftTeams: this.microsoftTeamsProjectChatConfigStore.snapshot()
    };
  }

  restore(snapshot: unknown) {
    const state = snapshot as { slack: unknown; microsoftTeams: unknown };
    this.slackProjectChatConfigStore.restore(state.slack);
    this.microsoftTeamsProjectChatConfigStore.restore(state.microsoftTeams);
  }
}
