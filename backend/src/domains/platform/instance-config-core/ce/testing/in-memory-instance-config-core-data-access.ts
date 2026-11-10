import { InMemoryTransactionRunner } from "@app/domains/lib/testing/in-memory-transaction-runner";

import { TInstanceConfigCoreDataAccess } from "../data-access/instance-config-core-data-access";
import { TInstanceConfigCoreDataAccessDeps } from "../module";
import { InMemoryInstanceConfigCoreState } from "./in-memory-instance-config-core-state";
import { InMemoryInstanceConfigDataAccess } from "./in-memory-instance-config-data-access";

const buildDataAccess = (state: InMemoryInstanceConfigCoreState): TInstanceConfigCoreDataAccess => ({
  instanceConfig: new InMemoryInstanceConfigDataAccess(state)
});

// Instance Config Core's data access in memory: one state behind the transaction runner and the data access outside it.
export class InMemoryInstanceConfigCoreDataAccess implements TInstanceConfigCoreDataAccessDeps {
  readonly state = new InMemoryInstanceConfigCoreState();

  readonly transactionRunner: TInstanceConfigCoreDataAccessDeps["transactionRunner"];

  readonly dataAccess: TInstanceConfigCoreDataAccess;

  constructor() {
    const { state } = this;
    this.transactionRunner = new InMemoryTransactionRunner(state, () => buildDataAccess(state));
    this.dataAccess = buildDataAccess(state);
  }
}
