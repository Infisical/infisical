import { PackRule, packRules } from "@casl/ability/extra";

import { AccessScope, ProjectMembershipRole, ProjectType } from "@app/db/schemas";
import { ActorContextMemo, TActorContext } from "@app/domains/lib/actor-context";
import { EntityNotFoundError, PermissionDeniedError, RuleViolationError } from "@app/domains/lib/errors";
import {
  ActorGrants,
  Grant,
  Permission,
  RuleIdentity,
  TActorGrantsService,
  TGrantActor,
  TGroupService,
  TRoleService
} from "@app/domains/platform/access-control/ce/module";
import { ActorType } from "@app/lib/auth/actor-types";
import { effectiveActorForProject, TPrincipal } from "@app/lib/auth/principal";

import { Project } from "../../models/project";
import { ProjectAccess } from "../../models/project-access";
import { ProjectPermission } from "../../models/project-permission";
import { ProjectPermissionSet } from "../../models/project-permission-set";
import { StandardProjectRoles, TProjectRoles, TProjectRule } from "../../models/standard-project-roles";
import { TProjectCache, TProjectStore } from "../dependencies";

export type TGetProjectPermissionInput = {
  actor: TActorContext;
  projectId: string;
  // The product the call is for. A project of another type is refused; omit it for checks every project type shares.
  type?: ProjectType;
};

export type TProjectRolePermission = {
  permission: Permission<ProjectPermissionSet>;
  // The custom role, or the built-in slug as its own name.
  role: { name: string; slug: string; id?: string; description?: string | null; permissions?: unknown };
};

// One of the roles or project-wide privileges an actor holds in a project, as a permission audit shows it.
export type TProjectPermissionAuditSource = {
  id: string;
  type: "role" | "group_role" | "additional_privilege";
  name: string;
  slug?: string;
  groupId?: string;
  groupName?: string;
  isTemporary: boolean;
  temporaryAccessStartTime?: string;
  temporaryAccessEndTime?: string;
  permissions: PackRule<TProjectRule>[];
};

export type TProjectPermissionService = {
  // What the actor may do in the project from its project roles: checks every project type shares, and products
  // whose roles are all they need (Cert Manager, Secret Scanning, KMS).
  getProjectPermission(input: TGetProjectPermissionInput): Promise<ProjectPermission>;
  // The actor's place in the project, for a product that adds its own rules (Secrets). Refuses a non-member.
  getProjectAccess(input: TGetProjectPermissionInput): Promise<ProjectAccess>;
  // The same, or null for an actor that is not a member of the project.
  findProjectAccess(input: TGetProjectPermissionInput): Promise<ProjectAccess | null>;
  // What the roles held in projects of this type grant.
  getProjectRoles(input: { projectType: ProjectType }): TProjectRoles;
  // Each slug as a permission of its own, as the project's product defines it: built-in slugs as defined, custom
  // slugs from the project's custom roles. Refuses a slug with no role unless told to skip it.
  getProjectPermissionByRoles(input: {
    projectId: string;
    roles: string[];
    ignoreUnresolvedRoles?: boolean;
  }): Promise<TProjectRolePermission[]>;
  // Each active role and project-wide privilege another user or identity holds, as a permission of its own with its
  // `{{identity.*}}` placeholders filled in. The caller passes the actor's name.
  getGrantPermissions(input: {
    actor: TGrantActor & { name: string };
    orgId: string;
    projectId: string;
  }): Promise<Permission<ProjectPermissionSet>[]>;
  // The roles (direct and through groups) and project-wide privileges a user or identity holds, for its permission
  // audit. Folder grants belong to Secrets, which adds them for its projects.
  getPermissionAuditSources(input: {
    target: TGrantActor;
    orgId: string;
    projectId: string;
  }): Promise<{ sources: TProjectPermissionAuditSource[]; grants: ActorGrants }>;
};

type TLoadedAccess = { project: Project; grants: ActorGrants; grantActor: TGrantActor };

export class ProjectPermissionService implements TProjectPermissionService {
  private readonly rolesByType: Map<ProjectType, TProjectRoles>;

  constructor(
    private readonly projectStore: TProjectStore,
    private readonly projectCache: TProjectCache,
    private readonly actorGrantsService: TActorGrantsService,
    private readonly roleService: TRoleService,
    private readonly groupService: TGroupService,
    projectRoles: TProjectRoles[],
    private readonly memo: ActorContextMemo<TLoadedAccess>
  ) {
    this.rolesByType = new Map();
    projectRoles.forEach((roles) => {
      if (this.rolesByType.has(roles.projectType)) {
        throw new Error(`Project roles for project type '${roles.projectType}' are passed twice`);
      }
      this.rolesByType.set(roles.projectType, roles);
    });
  }

  async getProjectPermission(input: TGetProjectPermissionInput): Promise<ProjectPermission> {
    return (await this.getProjectAccess(input)).toPermission();
  }

  async getProjectAccess(input: TGetProjectPermissionInput): Promise<ProjectAccess> {
    const access = await this.findProjectAccess(input);
    if (access) return access;
    const grantActor = ProjectPermissionService.grantActorFor(input.actor.principal, input.projectId);
    throw new PermissionDeniedError({
      name: "ProjectMembershipNotFound",
      message: `You are not a member of this project with ID ${input.projectId}. Please assign this ${grantActor.type} to the project with the appropriate permissions, then try again.`
    });
  }

  async findProjectAccess({ actor, projectId, type }: TGetProjectPermissionInput): Promise<ProjectAccess | null> {
    const { principal } = actor;
    const grantActor = ProjectPermissionService.grantActorFor(principal, projectId);
    const { project, grants } = await this.memo.getOrCompute(actor, projectId, async () => {
      const loaded = await this.projectCache.getOrLoad({
        projectId,
        fingerprint: () => this.projectStore.findDeletionState(projectId),
        load: async () => {
          const found = await this.projectStore.findById(projectId);
          if (!found) throw new EntityNotFoundError({ message: `Project with ${projectId} not found` });
          return found;
        }
      });
      const actorGrants = await this.actorGrantsService.getCachedProjectGrants({
        actor: grantActor,
        orgId: loaded.orgId,
        projectId
      });
      return { project: loaded, grants: actorGrants, grantActor };
    });

    project.assertUsableBy({ orgId: actor.org.id, type });
    if (!grants.hasMembership) return null;

    return ProjectAccess.create({
      project,
      grants,
      roles: this.getProjectRoles({ projectType: project.type }),
      principal,
      identity: ProjectPermissionService.identityFor({ principal, grantActor, grants })
    });
  }

  getProjectRoles({ projectType }: { projectType: ProjectType }): TProjectRoles {
    return this.rolesByType.get(projectType) ?? StandardProjectRoles.generic(projectType);
  }

  async getProjectPermissionByRoles({
    projectId,
    roles,
    ignoreUnresolvedRoles = false
  }: {
    projectId: string;
    roles: string[];
    ignoreUnresolvedRoles?: boolean;
  }): Promise<TProjectRolePermission[]> {
    const isBuiltIn = (slug: string) => Object.values(ProjectMembershipRole).includes(slug as ProjectMembershipRole);
    const project = await this.projectStore.findById(projectId);
    const projectRoles = project ? this.getProjectRoles({ projectType: project.type }) : null;
    const customSlugs = roles.filter((slug) => !isBuiltIn(slug));
    const customRoles = await this.roleService.findRolesBySlugs({ owner: { projectId }, slugs: customSlugs });
    const bySlug = new Map(customRoles.map((role) => [role.slug, role]));
    const missing = customSlugs.filter((slug) => !bySlug.has(slug));
    if (missing.length && !ignoreUnresolvedRoles) {
      throw new EntityNotFoundError({
        message: `Specified roles '${missing.join(",")}' was not found in the project with ID '${projectId}'`
      });
    }
    const permissionOf = (grant: Grant) =>
      Permission.fromRules<ProjectPermissionSet>({
        rules: ProjectAccess.rulesOf([grant], projectRoles ?? StandardProjectRoles.generic(ProjectType.SecretManager))
      });
    return roles.flatMap((slug): TProjectRolePermission[] => {
      if (isBuiltIn(slug)) return [{ permission: permissionOf(Grant.restore({ slug })), role: { name: slug, slug } }];
      const role = bySlug.get(slug);
      if (!role) return [];
      return [{ permission: permissionOf(role.toGrant()), role: role.toJSON() }];
    });
  }

  async getGrantPermissions({
    actor,
    orgId,
    projectId
  }: {
    actor: TGrantActor & { name: string };
    orgId: string;
    projectId: string;
  }): Promise<Permission<ProjectPermissionSet>[]> {
    const [project, grants] = await Promise.all([
      this.projectStore.findById(projectId),
      this.actorGrantsService.getActorGrants({
        actor: { type: actor.type, id: actor.id },
        scope: { scope: AccessScope.Project, orgId, projectId }
      })
    ]);
    const roles = project
      ? this.getProjectRoles({ projectType: project.type })
      : StandardProjectRoles.generic(ProjectType.SecretManager);
    const identity = RuleIdentity.create({ id: actor.id, username: actor.name, metadata: grants.attributeMap() });
    return grants.active().map((grant) =>
      Permission.fromRules<ProjectPermissionSet>({
        rules: ProjectAccess.rulesOf([grant], roles).interpolateStored(identity.toContext())
      })
    );
  }

  async getPermissionAuditSources({
    target,
    orgId,
    projectId
  }: {
    target: TGrantActor;
    orgId: string;
    projectId: string;
  }): Promise<{ sources: TProjectPermissionAuditSource[]; grants: ActorGrants }> {
    const [project, grants] = await Promise.all([
      this.projectStore.findById(projectId),
      this.actorGrantsService.getActorGrants({ actor: target, scope: { scope: AccessScope.Project, orgId, projectId } })
    ]);
    if (!grants.hasMembership) {
      const label = target.type === ActorType.USER ? "user" : "identity";
      const idName = target.type === ActorType.USER ? "targetUserId" : "targetIdentityId";
      throw new EntityNotFoundError({
        message: `Target ${label} with ID '${target.id}' is not a member of project with ID '${projectId}' [${idName}=${target.id}] [projectId=${projectId}]`
      });
    }
    const roles = project
      ? this.getProjectRoles({ projectType: project.type })
      : StandardProjectRoles.generic(ProjectType.SecretManager);
    const groupIds = [
      ...new Set(grants.memberships.flatMap((membership) => (membership.viaGroupId ? [membership.viaGroupId] : [])))
    ];
    const groups = await this.groupService.findGroupsByIds({ ids: groupIds });
    const groupNameById = new Map(groups.map((group) => [group.id, group.name]));
    const pack = (grant: Grant) => packRules(ProjectAccess.rulesOf([grant], roles).rules);
    const now = new Date();

    const sources: TProjectPermissionAuditSource[] = grants.memberships.flatMap((membership) => {
      const groupId = membership.viaGroupId ?? undefined;
      return membership.activeRoles(now).map((role): TProjectPermissionAuditSource => {
        const isCustom = role.role === ProjectMembershipRole.Custom;
        return {
          id: role.id,
          type: groupId ? "group_role" : "role",
          name: isCustom ? role.customRoleName || role.customRoleSlug || "Custom" : role.role,
          slug: isCustom ? ProjectMembershipRole.Custom : role.role,
          groupId,
          groupName: groupId ? groupNameById.get(groupId) : undefined,
          isTemporary: role.isTemporary,
          temporaryAccessStartTime: role.temporaryAccessStartTime?.toISOString(),
          temporaryAccessEndTime: role.temporaryAccessEndTime?.toISOString(),
          permissions: pack(role.toGrant())
        };
      });
    });
    grants.activePrivileges(now).forEach((privilege) => {
      sources.push({
        id: privilege.id,
        type: "additional_privilege",
        name: privilege.name || "Additional Privilege",
        isTemporary: privilege.isTemporary,
        temporaryAccessStartTime: privilege.temporaryAccessStartTime?.toISOString(),
        temporaryAccessEndTime: privilege.temporaryAccessEndTime?.toISOString(),
        permissions: pack(privilege.toGrant())
      });
    });
    return { sources, grants };
  }

  // Whose grants decide: the principal, or the actor it assumed inside this project. Only users and identities hold
  // project roles.
  private static grantActorFor(principal: TPrincipal, projectId: string): TGrantActor {
    if (principal.type !== ActorType.USER && principal.type !== ActorType.IDENTITY) {
      throw new RuleViolationError({ message: "Invalid actor provided", name: "Get org permission" });
    }
    const effective = effectiveActorForProject(principal, projectId);
    return { type: effective.actorType, id: effective.actorId };
  }

  private static identityFor({
    principal,
    grantActor,
    grants
  }: {
    principal: TPrincipal;
    grantActor: TGrantActor;
    grants: ActorGrants;
  }): RuleIdentity {
    const isPrincipal = principal.id === grantActor.id;
    let username = "";
    if (isPrincipal && principal.type === ActorType.USER) username = principal.username;
    if (isPrincipal && principal.type === ActorType.IDENTITY) username = principal.name;
    if (!isPrincipal && "assumed" in principal) username = principal.assumed?.actorName ?? "";
    // identity.auth is knowable only for the identity making the request.
    const auth = isPrincipal && principal.type === ActorType.IDENTITY && principal.authInfo ? principal.authInfo : null;
    return RuleIdentity.create({ id: grantActor.id, username, metadata: grants.attributeMap(), auth });
  }
}
