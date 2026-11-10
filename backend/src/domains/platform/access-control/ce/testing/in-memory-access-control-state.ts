import crypto from "node:crypto";

import {
  TAdditionalPrivileges,
  TGroups,
  TIdentityMetadata,
  TMembershipRoles,
  TMemberships,
  TRoles
} from "@app/db/schemas";

type TTables = {
  memberships: Map<string, TMemberships>;
  membershipRoles: Map<string, TMembershipRoles>;
  roles: Map<string, TRoles>;
  privileges: Map<string, TAdditionalPrivileges>;
  groups: Map<string, TGroups>;
  userGroups: { userId: string; groupId: string; isPending: boolean }[];
  identityGroups: { identityId: string; groupId: string }[];
  attributes: Map<string, TIdentityMetadata>;
};

const emptyTables = (): TTables => ({
  memberships: new Map(),
  membershipRoles: new Map(),
  roles: new Map(),
  privileges: new Map(),
  groups: new Map(),
  userGroups: [],
  identityGroups: [],
  attributes: new Map()
});

// Access Control's tables in memory, with the cascades Postgres applies to them.
export class InMemoryAccessControlState {
  tables: TTables = emptyTables();

  static newId(): string {
    return crypto.randomUUID();
  }

  groupIdsOf(actor: { userId: string } | { identityId: string }): string[] {
    if ("userId" in actor) {
      return this.tables.userGroups.filter((row) => row.userId === actor.userId).map((row) => row.groupId);
    }
    return this.tables.identityGroups.filter((row) => row.identityId === actor.identityId).map((row) => row.groupId);
  }

  deleteMembership(id: string) {
    this.tables.memberships.delete(id);
    for (const [roleId, role] of this.tables.membershipRoles) {
      if (role.membershipId === id) this.tables.membershipRoles.delete(roleId);
    }
  }

  snapshot(): unknown {
    return structuredClone(this.tables);
  }

  restore(snapshot: unknown) {
    this.tables = snapshot as TTables;
  }
}
