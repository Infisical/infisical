import { ProjectType } from "@app/db/schemas";
import { DataAccessDb } from "@app/domains/lib/data-access-db";
import { Meter, TLicenseRegistry } from "@app/domains/platform/license/ce/module";
import { TOrganizationsDomain } from "@app/domains/platform/organizations/ce/module";

import { ProjectDataAccess } from "./data-access/project-data-access";
import { BillableActorDataAccess, TIdentityOwnershipRow } from "./data-access/usage-counter-data-access";

export type { TIdentityOwnershipRow };
export * from "./service/permission/project-permission";
export * from "./service/permission/project-roles";

export type TProjectsDomain = {
  // Billable users and machine identities: org members in a Secret Manager or KMS project or in none.
  // A null orgId counts the whole instance.
  countBillableOrgActors: (orgId: string | null) => Promise<{ users: number; identities: number }>;
  getBillableIdentityOwnershipBreakdown: (orgId: string | null) => Promise<TIdentityOwnershipRow[]>;
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

export type TProjectsDeps = {
  db: DataAccessDb;
  organizationsDomain: TOrganizationsDomain;
  licenseRegistry: TLicenseRegistry;
};

// The container every product's projects live in. Holds the workspace and billable-actor counts for now.
export class ProjectsModule {
  readonly name = "projects";

  readonly service: TProjectsDomain;

  constructor({ db, organizationsDomain, licenseRegistry }: TProjectsDeps) {
    const actors = new BillableActorDataAccess(db);
    const projects = new ProjectDataAccess(db);
    this.service = {
      countBillableOrgActors: (orgId) => actors.countBillableOrgActors(orgId),
      getBillableIdentityOwnershipBreakdown: (orgId) => actors.getBillableIdentityOwnershipBreakdown(orgId),
      countWorkspaces: (orgId) => projects.countWorkspaces(orgId),
      countProjectIdentities: (projectType, orgId) => actors.countProjectIdentities(projectType, orgId),
      countProjectIdentitiesByKind: (projectType, orgId) => actors.countProjectIdentitiesByKind(projectType, orgId),
      getProjectIdentityBreakdown: (projectType, orgId) =>
        actors.getProjectIdentityOwnershipBreakdown(projectType, orgId)
    };

    licenseRegistry.registerOrganizations({
      findRootOrgId: (orgId) => organizationsDomain.findRootOrgId(orgId),
      countWorkspacesUsed: (rootOrgId) => projects.countWorkspaces(rootOrgId),
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
