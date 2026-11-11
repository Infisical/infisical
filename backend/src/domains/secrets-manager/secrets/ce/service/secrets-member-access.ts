import { PackRule, packRules } from "@casl/ability/extra";

import { ProjectMembershipRole, ProjectType } from "@app/db/schemas";
import {
  ActorGrants,
  escapeHandlebarsMissingDict,
  interpolatePermissionRules,
  overrideAt,
  Permission,
  Privilege,
  TAccessControlDomain,
  TGrantActor,
  TPermissionRule
} from "@app/domains/platform/access-control/ce/module";
import {
  ProjectPermissionSet,
  TProjectPermissionAuditSource,
  TProjectsDomain
} from "@app/domains/platform/projects/ce/module";
import { ActorType } from "@app/lib/auth/actor-types";

import { FolderPathDataAccess } from "../data-access/folder-path-data-access";
import { MemberNameDataAccess } from "../data-access/member-name-data-access";
import { buildFolderScopedPrivilegeRules, TFolderGrant } from "./folder-grant-rules";

type TProjectRule = TPermissionRule<ProjectPermissionSet>;

export type TMemberRoleSummary = {
  id: string;
  role: string;
  customRoleSlug?: string | null;
  customRoleId?: string | null;
  customRoleName?: string | null;
};

// One user or identity that is a member directly, with its permission (roles, project-wide privileges and folder
// grants).
export type TDirectMemberPermission = {
  permission: Permission<ProjectPermissionSet>;
  id: string;
  name: string;
  membershipId: string;
  roles: TMemberRoleSummary[];
  additionalPrivileges: { id: string; name: string }[];
  // Each role ("role:<assignment id>") and project-wide privilege ("privilege:<id>") as a permission of its own,
  // without folder grants.
  accessSources: () => { key: string; permission: Permission<ProjectPermissionSet> }[];
};

export type TGroupMemberPermission = {
  permission: Permission<ProjectPermissionSet>;
  id: string;
  name: string;
  membershipId: string;
  roles: Omit<TMemberRoleSummary, "id">[];
};

export type TProjectMemberPermissions = {
  userPermissions: TDirectMemberPermission[];
  identityPermissions: TDirectMemberPermission[];
  groupPermissions: TGroupMemberPermission[];
  // Each user's and identity's active folder grants, keyed by actor id, whether they are a direct member or reach
  // the project through a group. Admins are listed too, though their grants are never applied.
  folderAccessByActorId: Map<string, TFolderGrant[]>;
  // One person's permission merged across their direct membership and the given groups, the way
  // getSecretsPermission builds it. Pass the username and metadata of someone who is only in the project through a
  // group, since only direct members' details are loaded here.
  permissionForActor: (input: {
    actorId: string;
    groupIds: string[];
    username?: string;
    metadata?: { key: string; value: string }[];
    // Only what the given groups give the person, without their direct membership or folder grants.
    groupsOnly?: boolean;
  }) => Permission<ProjectPermissionSet>;
  // Whether any group role holds a placeholder such as {{identity.username}}.
  groupRulesHavePlaceholders: boolean;
};

export type TSecretsMemberAccessDeps = {
  projectsDomain: Pick<TProjectsDomain, "findProject" | "resolveRoleRules">;
  accessControlDomain: Pick<
    TAccessControlDomain,
    "findProjectMemberGrants" | "findProjectFolderGrants" | "findFolderGrants" | "findGroupsByIds"
  >;
  folderPaths: Pick<FolderPathDataAccess, "findLocations">;
  memberNames: Pick<MemberNameDataAccess, "findNames">;
};

type TResolvedFolderGrant = TFolderGrant & { privilege: Privilege };

// Permissions over a project's members rather than for the actor making the request: the member listing (who can
// reach a secret) and the folder grant parts of a member's audit. Callers check that the request may see them.
export class SecretsMemberAccess {
  constructor(private readonly deps: TSecretsMemberAccessDeps) {}

  async getProjectMemberPermissions({
    orgId,
    projectId
  }: {
    orgId: string;
    projectId: string;
  }): Promise<TProjectMemberPermissions> {
    const project = await this.deps.projectsDomain.findProject({ projectId });
    const [members, folderGrants] = await Promise.all([
      this.deps.accessControlDomain.findProjectMemberGrants({ orgId, projectId }),
      project?.type === ProjectType.SecretManager
        ? this.resolveFolderGrants(
            projectId,
            await this.deps.accessControlDomain.findProjectFolderGrants({ projectId })
          )
        : Promise.resolve([] as TResolvedFolderGrant[])
    ]);
    const now = new Date();
    const folderAccessByActorId = new Map<string, TFolderGrant[]>();
    folderGrants
      .filter(({ privilege }) => privilege.isActive(now))
      .forEach(({ privilege, ...grant }) => {
        const { actorUserId, actorIdentityId } = privilege.toJSON();
        const actorId = (actorUserId ?? actorIdentityId) as string;
        folderAccessByActorId.set(actorId, [...(folderAccessByActorId.get(actorId) ?? []), grant]);
      });

    const directMembers = members.directMembers();
    const groupMembers = members.groupMembers();
    const [names, groups] = await Promise.all([
      this.deps.memberNames.findNames({
        userIds: directMembers.flatMap(({ actor }) => (actor.type === ActorType.USER ? [actor.id] : [])),
        identityIds: directMembers.flatMap(({ actor }) => (actor.type === ActorType.IDENTITY ? [actor.id] : []))
      }),
      this.deps.accessControlDomain.findGroupsByIds({ ids: groupMembers.map(({ groupId }) => groupId) })
    ]);
    const groupNameById = new Map(groups.map((group) => [group.id, group.name]));

    const resolve = (entries: { role: string; permissions?: unknown }[], grants: ActorGrants) =>
      this.deps.projectsDomain.resolveRoleRules({ entries, project, grants });
    const withFolderGrants = (rules: TProjectRule[], grants: ActorGrants, actorFolderGrants?: TFolderGrant[]) =>
      grants.hasActiveBuiltInRole(ProjectMembershipRole.Admin) || !actorFolderGrants?.length
        ? rules
        : overrideAt({ base: rules, overrides: buildFolderScopedPrivilegeRules(actorFolderGrants) });
    const identityOf = (id: string, username: string, attributes: Record<string, string>) => ({
      identity: { id, username, metadata: escapeHandlebarsMissingDict(attributes, "identity.metadata") }
    });

    const sourceCache = new Map<string, Permission<ProjectPermissionSet>>();
    const cachedPermission = (rules: TProjectRule[], cache: Map<string, Permission<ProjectPermissionSet>>) => {
      const key = JSON.stringify(rules);
      let permission = cache.get(key);
      if (!permission) {
        permission = Permission.fromRules({ rules });
        cache.set(key, permission);
      }
      return permission;
    };

    const directPermissions = directMembers.flatMap(({ actor, membership }) => {
      const name = actor.type === ActorType.USER ? names.users.get(actor.id) : names.identities.get(actor.id);
      if (name === undefined) return [];
      const grants = members.grantsFor({ actor });
      const identityContext = identityOf(actor.id, name, grants.attributeMap());
      const rules = withFolderGrants(
        resolve(grants.activeEntries(ProjectMembershipRole.Custom), grants),
        grants,
        folderAccessByActorId.get(actor.id)
      );
      const activeRoles = membership.activeRoles(now);
      const activePrivileges = grants.privileges.filter((privilege) => privilege.isActive(now));
      let sources: { key: string; permission: Permission<ProjectPermissionSet> }[] | undefined;
      const entry: TDirectMemberPermission = {
        permission: Permission.fromRules({ rules: interpolatePermissionRules(rules, identityContext) }),
        id: actor.id,
        name,
        membershipId: membership.id,
        roles: activeRoles.map((role) => ({
          id: role.id,
          role: role.role,
          customRoleSlug: role.customRoleSlug,
          customRoleId: role.customRoleId,
          customRoleName: role.customRoleName
        })),
        additionalPrivileges: activePrivileges.map((privilege) => ({ id: privilege.id, name: privilege.name })),
        accessSources: () => {
          sources ??= [
            ...activeRoles.map((role) => ({
              key: `role:${role.id}`,
              entries: [{ role: role.role, permissions: role.customRolePermissions }]
            })),
            ...activePrivileges.map((privilege) => ({
              key: `privilege:${privilege.id}`,
              entries: [{ role: ProjectMembershipRole.Custom, permissions: privilege.permissions }]
            }))
          ].map(({ key, entries }) => ({
            key,
            permission: cachedPermission(
              interpolatePermissionRules(resolve(entries, grants), identityContext),
              sourceCache
            )
          }));
          return sources;
        }
      };
      return [{ type: actor.type, entry }];
    });

    const groupPermissions: TGroupMemberPermission[] = groupMembers.map(({ groupId, membership }) => {
      const activeRoles = membership.activeRoles(now);
      const grants = ActorGrants.empty();
      return {
        permission: Permission.fromRules({
          rules: resolve(
            activeRoles.map((role) => ({ role: role.role, permissions: role.customRolePermissions })),
            grants
          )
        }),
        id: groupId,
        name: groupNameById.get(groupId) ?? "",
        membershipId: membership.id,
        roles: activeRoles.map((role) => ({
          role: role.role,
          customRoleSlug: role.customRoleSlug,
          customRoleId: role.customRoleId,
          customRoleName: role.customRoleName
        }))
      };
    });

    const directByActorId = new Map(
      directMembers.map(({ actor }) => [
        actor.id,
        { actor, name: actor.type === ActorType.USER ? names.users.get(actor.id) : names.identities.get(actor.id) }
      ])
    );
    const mergedCache = new Map<string, Permission<ProjectPermissionSet>>();
    const permissionForActor: TProjectMemberPermissions["permissionForActor"] = ({
      actorId,
      groupIds,
      username,
      metadata,
      groupsOnly = false
    }) => {
      const direct = directByActorId.get(actorId);
      const grants = members.grantsFor({
        actor: direct?.actor ?? { type: ActorType.USER, id: actorId },
        groupIds,
        includeDirect: Boolean(direct) && !groupsOnly
      });
      const attributes = direct
        ? grants.attributeMap()
        : Object.fromEntries((metadata ?? []).map(({ key, value }) => [key, value]));
      const rules = withFolderGrants(
        resolve(grants.activeEntries(ProjectMembershipRole.Custom), grants),
        grants,
        groupsOnly ? undefined : folderAccessByActorId.get(actorId)
      );
      const interpolated = interpolatePermissionRules(
        rules,
        identityOf(actorId, direct?.name ?? username ?? "", attributes)
      );
      return cachedPermission(interpolated, mergedCache);
    };

    return {
      userPermissions: directPermissions.filter(({ type }) => type === ActorType.USER).map(({ entry }) => entry),
      identityPermissions: directPermissions
        .filter(({ type }) => type === ActorType.IDENTITY)
        .map(({ entry }) => entry),
      groupPermissions,
      folderAccessByActorId,
      permissionForActor,
      groupRulesHavePlaceholders: groupMembers.some(({ membership }) =>
        membership.roles.some((role) => JSON.stringify(role.customRolePermissions ?? []).includes("{{"))
      )
    };
  }

  // A member's active folder grants as permission audit sources. Secret Manager projects only; a built-in admin
  // gets none, since its folder grants never apply.
  async getFolderGrantAuditSources({
    target,
    projectId,
    grants
  }: {
    target: TGrantActor;
    projectId: string;
    grants: ActorGrants;
  }): Promise<TProjectPermissionAuditSource[]> {
    const folderGrants = await this.activeFolderGrantsOf({ target, projectId, grants });
    return folderGrants.map(({ privilege, ...grant }) => ({
      id: grant.id,
      type: "additional_privilege",
      name: privilege.name || "Folder Access",
      isTemporary: privilege.isTemporary,
      temporaryAccessStartTime: privilege.temporaryAccessStartTime?.toISOString(),
      temporaryAccessEndTime: privilege.temporaryAccessEndTime?.toISOString(),
      permissions: packRules(buildFolderScopedPrivilegeRules([grant])) as PackRule<TProjectRule>[]
    }));
  }

  // Each of a member's active folder grants as a permission of its own, its allow rules only. Secret Manager
  // projects only; none for a built-in admin.
  async getFolderGrantPermissions({
    target,
    projectId,
    grants
  }: {
    target: TGrantActor;
    projectId: string;
    grants: ActorGrants;
  }): Promise<Permission<ProjectPermissionSet>[]> {
    const folderGrants = await this.activeFolderGrantsOf({ target, projectId, grants });
    return folderGrants.map(({ privilege: _privilege, ...grant }) =>
      Permission.fromRules({ rules: buildFolderScopedPrivilegeRules([grant]).filter((rule) => !rule.inverted) })
    );
  }

  private async activeFolderGrantsOf({
    target,
    projectId,
    grants
  }: {
    target: TGrantActor;
    projectId: string;
    grants: ActorGrants;
  }): Promise<TResolvedFolderGrant[]> {
    if (grants.hasActiveBuiltInRole(ProjectMembershipRole.Admin)) return [];
    const project = await this.deps.projectsDomain.findProject({ projectId });
    if (project?.type !== ProjectType.SecretManager) return [];
    const privileges = await this.deps.accessControlDomain.findFolderGrants({ actor: target, projectId });
    const now = new Date();
    return (await this.resolveFolderGrants(projectId, privileges)).filter(({ privilege }) => privilege.isActive(now));
  }

  // Each folder grant with its folder's environment and path; a grant whose folder is gone grants nothing.
  private async resolveFolderGrants(projectId: string, privileges: Privilege[]): Promise<TResolvedFolderGrant[]> {
    const locations = await this.deps.folderPaths.findLocations(
      projectId,
      privileges.map((privilege) => privilege.folderId as string)
    );
    return privileges.flatMap((privilege, index) => {
      const location = locations[index];
      if (!location || !privilege.role) return [];
      return [
        {
          id: privilege.id,
          folderId: privilege.folderId as string,
          role: privilege.role,
          environmentSlug: location.environmentSlug,
          secretPath: location.path,
          privilege
        }
      ];
    });
  }
}
