import { ProjectType } from "@app/db/schemas";
import { DataAccessDb } from "@app/domains/lib/data-access-db";
import { Meter, TLicenseRegistry } from "@app/domains/platform/license/ce/module";

import { OrganizationDataAccess } from "./data-access/organization-data-access";
import { BillableActorDataAccess, TIdentityOwnershipRow } from "./data-access/usage-counter-data-access";

export type { TIdentityOwnershipRow };

export type TOrganizationsProjectsDomain = {
  // Billable users and machine identities: org members in a Secret Manager or KMS project or in none.
  // A null orgId counts the whole instance.
  countBillableOrgActors: (orgId: string | null) => Promise<{ users: number; identities: number }>;
  getBillableIdentityOwnershipBreakdown: (orgId: string | null) => Promise<TIdentityOwnershipRow[]>;
  resolveRootOrgId: (orgId: string) => Promise<string>;
  // Live projects that take a workspace slot on a plan, in the org and its sub-orgs.
  countWorkspaces: (orgId: string) => Promise<number>;
  // Users and machine identities in projects of one type, directly or through a group.
  countProjectIdentities: (projectType: ProjectType, orgId?: string) => Promise<number>;
  countProjectIdentitiesByKind: (
    projectType: ProjectType,
    orgId?: string
  ) => Promise<{ users: number; identities: number }>;
  getProjectIdentityBreakdown: (projectType: ProjectType, orgId?: string) => Promise<TIdentityOwnershipRow[]>;
};

export type TOrganizationsProjectsDeps = {
  db: DataAccessDb;
  licenseRegistry: TLicenseRegistry;
};

// Holds only usage counting for now; it grows as organizations and projects move into domains.
export class OrganizationsProjectsModule {
  readonly name = "organizations-projects";

  readonly service: TOrganizationsProjectsDomain;

  constructor({ db, licenseRegistry }: TOrganizationsProjectsDeps) {
    const actors = new BillableActorDataAccess(db);
    const organizations = new OrganizationDataAccess(db);
    this.service = {
      countBillableOrgActors: (orgId) => actors.countBillableOrgActors(orgId),
      getBillableIdentityOwnershipBreakdown: (orgId) => actors.getBillableIdentityOwnershipBreakdown(orgId),
      resolveRootOrgId: (orgId) => organizations.resolveRootOrgId(orgId),
      countWorkspaces: (orgId) => organizations.countWorkspaces(orgId),
      countProjectIdentities: (projectType, orgId) => actors.countProjectIdentities(projectType, orgId),
      countProjectIdentitiesByKind: (projectType, orgId) => actors.countProjectIdentitiesByKind(projectType, orgId),
      getProjectIdentityBreakdown: (projectType, orgId) =>
        actors.getProjectIdentityOwnershipBreakdown(projectType, orgId)
    };

    licenseRegistry.registerOrganizations({
      findRootOrgId: (orgId) => organizations.findRootOrgId(orgId),
      countWorkspacesUsed: (rootOrgId) => organizations.countWorkspaces(rootOrgId),
      countSeats: async (orgId) => {
        const { users, identities } = await actors.countBillableOrgActors(orgId);
        return { membersUsed: users, identitiesUsed: users + identities };
      }
    });
    licenseRegistry.registerUsageCounter({
      meter: Meter.Identities,
      count: async (orgId) => {
        const { users, identities } = await actors.countBillableOrgActors(orgId);
        return users + identities;
      }
    });
    licenseRegistry.registerUsageCounter({
      meter: Meter.UserIdentities,
      count: async (orgId) => (await actors.countBillableOrgActors(orgId)).users
    });
  }
}
