import { InMemoryTransactionRunner } from "@app/domains/lib/testing/in-memory-transaction-runner";

import { TAccessControlDataAccess } from "../data-access/access-control-data-access";
import { TAccessControlDataAccessDeps } from "../module";
import { InMemoryAccessControlState } from "./in-memory-access-control-state";
import { InMemoryGrantDataAccess } from "./in-memory-grant-data-access";
import { InMemoryGroupDataAccess } from "./in-memory-group-data-access";
import { InMemoryIdentityAttributeDataAccess } from "./in-memory-identity-attribute-data-access";
import { InMemoryMembershipDataAccess } from "./in-memory-membership-data-access";
import { InMemoryPrivilegeDataAccess } from "./in-memory-privilege-data-access";
import { InMemoryRoleDataAccess } from "./in-memory-role-data-access";

const buildDataAccess = (state: InMemoryAccessControlState): TAccessControlDataAccess => ({
  grants: new InMemoryGrantDataAccess(state),
  memberships: new InMemoryMembershipDataAccess(state),
  roles: new InMemoryRoleDataAccess(state),
  privileges: new InMemoryPrivilegeDataAccess(state),
  groups: new InMemoryGroupDataAccess(state),
  attributes: new InMemoryIdentityAttributeDataAccess(state)
});

// Access Control's data access in memory: one state behind the transaction runner and the data access outside it.
export class InMemoryAccessControlDataAccess implements TAccessControlDataAccessDeps {
  readonly state = new InMemoryAccessControlState();

  readonly transactionRunner: TAccessControlDataAccessDeps["transactionRunner"];

  readonly dataAccess: TAccessControlDataAccess;

  constructor() {
    const { state } = this;
    this.transactionRunner = new InMemoryTransactionRunner(state, () => buildDataAccess(state));
    this.dataAccess = buildDataAccess(state);
  }
}
