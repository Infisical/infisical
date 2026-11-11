import { AbilityTuple } from "@casl/ability";

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
import { ProjectMemberAccess } from "./service/project-member-access";
import {
  ProjectPermissionService,
  TGetProjectPermissionInput,
  TProjectRules
} from "./service/project-permission-service";
import { ProjectResourceAccess, TGetProjectResourcePermissionInput } from "./service/project-resource-access";
import { ProjectResourcePermission } from "./service/project-resource-permission";
import { ProjectRoleRules } from "./service/project-role-rules";

export type { TIdentityOwnershipRow };
export { Project } from "./model/project";
export * from "./service/permission/legacy-forbid-expansion";
export * from "./service/permission/project-oauth-scopes";
export type { TCustomRoleResolver, TProductAccessRegistry, TProjectRule } from "./service/product-access-registry";
export type { TBuildProjectPermissionInput, TProjectIdentityContext } from "./service/project-access";
export { ProjectPermission } from "./service/project-access";
export type { TGetProjectPermissionInput, TProjectRules } from "./service/project-permission-service";
export type {
  TGetProjectResourcePermissionInput,
  TResourceRef,
  TResourceRoles
} from "./service/project-resource-access";
export { ProjectResourcePermission } from "./service/project-resource-permission";
export type { TProjectPermissionAuditSource, TProjectRolePermission } from "./service/project-member-access";
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
  // The project facts a permission check needs, for a principal with no grants of its own (a service token).
  findProject: (input: { projectId: string }) => Promise<Project | undefined>;
  // What the actor may do on a resource inside a project (a PAM folder or account, a certificate application, a
  // signer), from its memberships on the resource, with the product's roles and project-admin fallback.
  getProjectResourcePermission: <TSet extends AbilityTuple>(
    input: TGetProjectResourcePermissionInput<TSet>
  ) => Promise<ProjectResourcePermission<TSet>>;
  // Each role slug as a permission of its own, resolved for the project's product: what a role change is measured
  // against. Refuses a custom slug the project does not have unless ignoreUnresolvedRoles.
  getProjectPermissionByRoles: ProjectMemberAccess["getProjectPermissionByRoles"];
  // Each active role and project-wide privilege another member holds, as a permission of its own.
  getGrantPermissions: ProjectMemberAccess["getGrantPermissions"];
  // A member's roles and project-wide privileges for its permission audit, and its grants. Not found for a non-member.
  getPermissionAuditSources: ProjectMemberAccess["getPermissionAuditSources"];
  // Role and privilege entries resolved for the project's product, cannot rules last. For listings that build many
  // members' permissions from grants they already read.
  resolveRoleRules: ProjectRoleRules["resolve"];
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
    const roleRules = new ProjectRoleRules(registry);
    const memberAccess = new ProjectMemberAccess({ accessControlDomain, projects, roleRules });
    const permissions = new ProjectPermissionService({
      accessControlDomain,
      projects,
      roleRules,
      memo: new ActorMemo<{ project: Project; grants: ActorGrants }>()
    });
    const resourceAccess = new ProjectResourceAccess({
      accessControlDomain,
      organizationsDomain,
      projectPermissions: permissions
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
      getProjectRules: (input) => permissions.getProjectRules(input),
      findProject: ({ projectId }) => projects.findById(projectId),
      getProjectResourcePermission: (input) => resourceAccess.getProjectResourcePermission(input),
      getProjectPermissionByRoles: (input) => memberAccess.getProjectPermissionByRoles(input),
      getGrantPermissions: (input) => memberAccess.getGrantPermissions(input),
      getPermissionAuditSources: (input) => memberAccess.getPermissionAuditSources(input),
      resolveRoleRules: (input) => roleRules.resolve(input)
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
