import { TDbClient } from "@app/db";
import { ProjectType } from "@app/db/schemas";
import { IdentitiesMeter, TUsageCounter, UserIdentities } from "@app/domains/platform/license/ce/module";

import { BillableActorDataAccess, TIdentityOwnershipRow } from "./data-access/usage-counter-data-access";

export type { TIdentityOwnershipRow };

export type TOrganizationsProjectsService = {
  // Billable users and machine identities: org members in a Secret Manager or KMS project or in none.
  // A null orgId counts the whole instance.
  countBillableOrgActors: (orgId: string | null) => Promise<{ users: number; identities: number }>;
  getBillableIdentityOwnershipBreakdown: (orgId: string | null) => Promise<TIdentityOwnershipRow[]>;
  resolveRootOrgId: (orgId: string) => Promise<string>;
  // Users and machine identities in projects of one type, directly or through a group.
  countProjectIdentities: (projectType: ProjectType, orgId?: string) => Promise<number>;
  countProjectIdentitiesByKind: (
    projectType: ProjectType,
    orgId?: string
  ) => Promise<{ users: number; identities: number }>;
  getProjectIdentityBreakdown: (projectType: ProjectType, orgId?: string) => Promise<TIdentityOwnershipRow[]>;
};

// Holds only the usage counters for now; it grows as organizations and projects move into domains.
export class OrganizationsProjectsModule {
  readonly name = "organizations-projects";

  readonly service: TOrganizationsProjectsService;

  readonly usageCounters: TUsageCounter[];

  constructor({ db }: { db: TDbClient }) {
    const actors = new BillableActorDataAccess(db);
    this.service = {
      countBillableOrgActors: (orgId) => actors.countBillableOrgActors(orgId),
      getBillableIdentityOwnershipBreakdown: (orgId) => actors.getBillableIdentityOwnershipBreakdown(orgId),
      resolveRootOrgId: (orgId) => actors.resolveRootOrgId(orgId),
      countProjectIdentities: (projectType, orgId) => actors.countProjectIdentities(projectType, orgId),
      countProjectIdentitiesByKind: (projectType, orgId) => actors.countProjectIdentitiesByKind(projectType, orgId),
      getProjectIdentityBreakdown: (projectType, orgId) =>
        actors.getProjectIdentityOwnershipBreakdown(projectType, orgId)
    };
    this.usageCounters = [
      {
        feature: IdentitiesMeter,
        scope: "org",
        count: async (orgId, tx) => {
          const { users, identities } = await actors.countBillableOrgActors(orgId, tx);
          return users + identities;
        }
      },
      {
        feature: UserIdentities,
        scope: "org",
        count: async (orgId, tx) => (await actors.countBillableOrgActors(orgId, tx)).users
      }
    ];
  }
}
