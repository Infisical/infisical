import { PackRule, packRules } from "@casl/ability/extra";

import { AccessScope, ProjectMembershipRole, ProjectType } from "@app/db/schemas";
import { ActorContextMemo, roleHolderOf, TActorContext } from "@app/domains/lib/actor-context";
import { EntityNotFoundError, PermissionDeniedError } from "@app/domains/lib/errors";
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
import { TPrincipal } from "@app/lib/auth/principal";

import { ProjectPermissionSet } from "../../models/permissions/project-permission-set";
import { Project } from "../../models/project";
import { ProjectAccess } from "../../models/project-access";
import { ProjectPermission } from "../../models/project-permission";
import { StandardProjectRoles, TProjectRoles, TProjectRule } from "../../models/standard-project-roles";
import { TProjectAccessListener, TProjectCache, TProjectStore } from "../dependencies";

export type TGetProjectPermissionInput = {
  actor: TActorContext;
  projectId: string;
  // A project of another type is refused. Omit for checks every project type shares.
  type?: ProjectType;
};

export type TProjectRolePermission = {
  permission: Permission<ProjectPermissionSet>;
  // Built-in roles use their slug as the name.
  role: { name: string; slug: string; id?: string; description?: string | null; permissions?: unknown };
};

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
  // For shared checks and products whose roles are all they need (Cert Manager, Secret Scanning, KMS).
  getProjectPermission(input: TGetProjectPermissionInput): Promise<ProjectPermission>;
  // For products that add their own rules (Secrets). Throws for a non-member.
  getProjectAccess(input: TGetProjectPermissionInput): Promise<ProjectAccess>;
  // Null for a non-member.
  findProjectAccess(input: TGetProjectPermissionInput): Promise<ProjectAccess | null>;
  getProjectRoles(input: { projectType: ProjectType }): TProjectRoles;
  // One permission per slug. Custom slugs come from the project's custom roles. Throws on an unknown slug unless
  // ignoreUnresolvedRoles.
  getProjectPermissionByRoles(input: {
    projectId: string;
    roles: string[];
    ignoreUnresolvedRoles?: boolean;
  }): Promise<TProjectRolePermission[]>;
  // One permission per active role and privilege, with `{{identity.*}}` placeholders filled in.
  getGrantPermissions(input: {
    actor: TGrantActor & { name: string };
    orgId: string;
    projectId: string;
  }): Promise<Permission<ProjectPermissionSet>[]>;
  // No folder grants here: those belong to Secrets, which adds them for its projects.
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
    private readonly memo: ActorContextMemo<TLoadedAccess>,
    private readonly onProjectAccess: TProjectAccessListener = () => {}
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
    const grantActor = roleHolderOf(input.actor.principal, { projectId: input.projectId });
    throw new PermissionDeniedError({
      name: "ProjectMembershipNotFound",
      message: `You are not a member of this project with ID ${input.projectId}. Please assign this ${grantActor.type} to the project with the appropriate permissions, then try again.`
    });
  }

  async findProjectAccess({ actor, projectId, type }: TGetProjectPermissionInput): Promise<ProjectAccess | null> {
    const { principal } = actor;
    const grantActor = roleHolderOf(principal, { projectId });
    const { project, grants } = await this.memo.getOrCompute(actor, projectId, async () => {
      const loaded = await this.projectCache.getOrLoad({
        projectId,
        actor: grantActor,
        fingerprint: () => this.projectStore.findVersion(projectId),
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

    this.onProjectAccess({ project, grants });
    return ProjectAccess.create({
      project,
      grants,
      roles: this.getProjectRoles({ projectType: project.type }),
      principal,
      identity: ProjectPermissionService.identityFor({ principal, grantActor, grants }),
      usesNewPrivilegeSystem: actor.org.shouldUseNewPrivilegeSystem
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
    const [project, resolved] = await Promise.all([
      this.projectStore.findById(projectId),
      this.roleService.resolveRoles({
        owner: { projectId },
        slugs: roles,
        builtInSlugs: Object.values(ProjectMembershipRole),
        ignoreUnresolvedRoles
      })
    ]);
    const projectRoles = project
      ? this.getProjectRoles({ projectType: project.type })
      : StandardProjectRoles.generic(ProjectType.SecretManager);
    return resolved.map(({ slug, grant, role }) => ({
      permission: Permission.fromRules<ProjectPermissionSet>({ rules: ProjectAccess.rulesOf([grant], projectRoles) }),
      role: role ? role.toJSON() : { name: slug, slug }
    }));
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
    const projectType = project?.type ?? ProjectType.SecretManager;
    // Roles per the project's product, but privileges always use the generic tables (matches the legacy engine).
    const roles = project ? this.getProjectRoles({ projectType }) : StandardProjectRoles.generic(projectType);
    const generic = StandardProjectRoles.generic(projectType);
    const identity = RuleIdentity.create({ id: actor.id, username: actor.name, metadata: grants.attributeMap() });
    const now = new Date();
    const held: [Grant, TProjectRoles][] = [
      ...grants
        .distinctActiveRoleGrants({ grantsNothing: [ProjectMembershipRole.NoAccess], now })
        .map((grant): [Grant, TProjectRoles] => [grant, roles]),
      ...grants.activePrivileges(now).map((privilege): [Grant, TProjectRoles] => [privilege.toGrant(), generic])
    ];
    return held.map(([grant, table]) =>
      Permission.fromRules<ProjectPermissionSet>({
        rules: ProjectAccess.rulesOf([grant], table).interpolateStored(identity.toContext())
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
    // Always the generic tables, whatever the project type, to match the legacy audit.
    const roles = StandardProjectRoles.generic(project?.type ?? ProjectType.SecretManager);
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
        return {
          id: role.id,
          type: groupId ? "group_role" : "role",
          name: role.displayName,
          slug: role.role,
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
    // A token keeps the name it was issued with, so prefer the current one.
    if (isPrincipal && principal.type === ActorType.IDENTITY) username = grants.actorName ?? principal.name;
    if (!isPrincipal && "assumed" in principal) username = principal.assumed?.actorName ?? "";
    // identity.auth is only known for the identity making the request.
    const auth = isPrincipal && principal.type === ActorType.IDENTITY && principal.authInfo ? principal.authInfo : null;
    return RuleIdentity.create({ id: grantActor.id, username, metadata: grants.attributeMap(), auth });
  }
}
