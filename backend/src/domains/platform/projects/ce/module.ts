import { ProjectType } from "@app/db/schemas";
import { ActorMemo } from "@app/domains/lib/actor-memo";
import { DataAccessDb } from "@app/domains/lib/data-access-db";
import { ActorGrants, TAccessControlDomain } from "@app/domains/platform/access-control/ce/module";
import { Meter, TLicenseRegistry } from "@app/domains/platform/license/ce/module";
import { TOrganizationsDomain } from "@app/domains/platform/organizations/ce/module";

import { ProjectDataAccess } from "./data-access/project-data-access";
import { BillableActorDataAccess, TIdentityOwnershipRow } from "./data-access/usage-counter-data-access";
import { Project } from "./model/project";
import { ProductAccessRegistry, TProductAccessRegistry } from "./service/product-access-registry";
import { ProjectPermission } from "./service/project-access";
import {
  ProjectPermissionService,
  TGetProjectPermissionInput,
  TProjectRules
} from "./service/project-permission-service";

export type { TIdentityOwnershipRow };
export { Project } from "./model/project";
export * from "./service/permission/legacy-forbid-expansion";
export * from "./service/permission/project-oauth-scopes";
export type { TCustomRoleResolver, TProductAccessRegistry, TProjectRule } from "./service/product-access-registry";
export type { TBuildProjectPermissionInput, TProjectIdentityContext } from "./service/project-access";
export { ProjectPermission } from "./service/project-access";
export type { TGetProjectPermissionInput, TProjectRules } from "./service/project-permission-service";
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
  // What the actor may do in a project, with its roles resolved for the project's product. For checks every project
  // type shares; a product's checks use its own function, which builds on getProjectRules.
  getProjectPermission: (input: TGetProjectPermissionInput) => Promise<ProjectPermission>;
  // The project, the actor's grants and its resolved role rules, for a product to compose its own layers on and pass
  // to ProjectPermission.build.
  getProjectRules: (input: TGetProjectPermissionInput) => Promise<TProjectRules>;
};

export type TProjectsDeps = {
  db: DataAccessDb;
  accessControlDomain: TAccessControlDomain;
  organizationsDomain: TOrganizationsDomain;
  licenseRegistry: TLicenseRegistry;
};

// The container every product's projects live in. Holds the workspace and billable-actor counts for now.
export class ProjectsModule {
  readonly name = "projects";

  readonly service: TProjectsDomain;

  // How each product's projects behave for access control; products register into it from their constructors.
  readonly productAccessRegistry: TProductAccessRegistry;

  constructor({ db, accessControlDomain, organizationsDomain, licenseRegistry }: TProjectsDeps) {
    const actors = new BillableActorDataAccess(db);
    const projects = new ProjectDataAccess(db);
    const registry = new ProductAccessRegistry();
    this.productAccessRegistry = registry;
    const permissions = new ProjectPermissionService({
      accessControlDomain,
      projects,
      registry,
      memo: new ActorMemo<{ project: Project; grants: ActorGrants }>()
    });
    this.service = {
      countBillableOrgActors: (orgId) => actors.countBillableOrgActors(orgId),
      getBillableIdentityOwnershipBreakdown: (orgId) => actors.getBillableIdentityOwnershipBreakdown(orgId),
      countWorkspaces: (orgId) => projects.countWorkspaces(orgId),
      countProjectIdentities: (projectType, orgId) => actors.countProjectIdentities(projectType, orgId),
      countProjectIdentitiesByKind: (projectType, orgId) => actors.countProjectIdentitiesByKind(projectType, orgId),
      getProjectIdentityBreakdown: (projectType, orgId) =>
        actors.getProjectIdentityOwnershipBreakdown(projectType, orgId),
      getProjectPermission: (input) => permissions.getProjectPermission(input),
      getProjectRules: (input) => permissions.getProjectRules(input)
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
