import { ProjectMembershipRole } from "@app/db/schemas";
import {
  ActorGrants,
  Grant,
  Permission,
  ProjectMemberGrants,
  RuleIdentity,
  RuleSet,
  TGroup
} from "@app/domains/platform/access-control/ce/module";
import {
  ProjectAccess,
  ProjectPermissionSet,
  TProjectRoles,
  TProjectRule
} from "@app/domains/platform/projects/ce/module";
import { ActorType } from "@app/lib/auth/actor-types";

import { FolderGrant } from "../../models/folder-grant";
import { FolderGrants } from "../../models/folder-grants";
import { TMemberNames } from "../dependencies";

type TProjectPermission = Permission<ProjectPermissionSet>;

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
  permission: TProjectPermission;
  id: string;
  name: string;
  membershipId: string;
  roles: TMemberRoleSummary[];
  additionalPrivileges: { id: string; name: string }[];
  // Each role ("role:<assignment id>") and project-wide privilege ("privilege:<id>") as a permission of its own,
  // without folder grants. Built on first use.
  accessSources: () => { key: string; permission: TProjectPermission }[];
};

export type TGroupMemberPermission = {
  permission: TProjectPermission;
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
  folderAccessByActorId: Map<string, FolderGrant[]>;
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
  }) => TProjectPermission;
  // Whether any group role holds a placeholder such as {{identity.username}}.
  groupRulesHavePlaceholders: boolean;
};

// Members whose sources have the same rules share one permission.
class PermissionsByRules {
  private readonly byRules = new Map<string, TProjectPermission>();

  of(rules: RuleSet<TProjectRule>): TProjectPermission {
    const key = JSON.stringify(rules.rules);
    let permission = this.byRules.get(key);
    if (!permission) {
      permission = Permission.fromRules<ProjectPermissionSet>({ rules });
      this.byRules.set(key, permission);
    }
    return permission;
  }
}

const withFolderGrants = (rules: RuleSet<TProjectRule>, grants: ActorGrants, folderGrants?: FolderGrant[]) =>
  grants.hasActiveBuiltInRole(ProjectMembershipRole.Admin) || !folderGrants?.length
    ? rules
    : rules.then(FolderGrants.inForce(folderGrants).rules());

// Every member's permission in one project, as the legacy listing built it: direct members' and groups' permissions
// from the standard project roles, and `permissionForActor` from the project's own roles.
export const buildProjectMemberPermissions = ({
  members,
  folderGrants,
  names,
  groups,
  standardRoles,
  projectRoles,
  now
}: {
  members: ProjectMemberGrants;
  // Every folder grant in the project, active or not.
  folderGrants: FolderGrant[];
  names: TMemberNames;
  groups: TGroup[];
  standardRoles: TProjectRoles;
  projectRoles: TProjectRoles;
  now: Date;
}): TProjectMemberPermissions => {
  const folderAccessByActorId = new Map<string, FolderGrant[]>();
  folderGrants.forEach((grant) => {
    if (!grant.actorId) return;
    folderAccessByActorId.set(grant.actorId, [...(folderAccessByActorId.get(grant.actorId) ?? []), grant]);
  });
  folderAccessByActorId.forEach((grants, actorId) => {
    folderAccessByActorId.set(actorId, FolderGrants.inForce(grants, now).list);
  });

  const nameOf = (actor: { type: ActorType.USER | ActorType.IDENTITY; id: string }) =>
    actor.type === ActorType.USER ? names.users.get(actor.id) : names.identities.get(actor.id);
  const rulesOf = (grants: Grant[], roles: TProjectRoles) => ProjectAccess.rulesOf(grants, roles);
  const identityOf = (id: string, username: string, metadata: Record<string, string>) =>
    RuleIdentity.create({ id, username, metadata }).toContext();

  const sourcePermissions = new PermissionsByRules();
  const directMembers = members.directMembers().flatMap(({ actor, membership }) => {
    const name = nameOf(actor);
    if (name === undefined) return [];
    const grants = members.grantsFor({ actor });
    const identity = identityOf(actor.id, name, grants.attributeMap());
    const rules = withFolderGrants(
      rulesOf(grants.active(now), standardRoles),
      grants,
      folderAccessByActorId.get(actor.id)
    );
    const activeRoles = membership.activeRoles(now);
    const activePrivileges = grants.activePrivileges(now);
    let sources: { key: string; permission: TProjectPermission }[] | undefined;
    const entry: TDirectMemberPermission = {
      permission: Permission.fromRules<ProjectPermissionSet>({ rules: rules.interpolate(identity) }),
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
          ...activeRoles.map((role) => ({ key: `role:${role.id}`, grant: role.toGrant() })),
          ...activePrivileges.map((privilege) => ({ key: `privilege:${privilege.id}`, grant: privilege.toGrant() }))
        ].map(({ key, grant }) => ({
          key,
          permission: sourcePermissions.of(rulesOf([grant], standardRoles).interpolate(identity))
        }));
        return sources;
      }
    };
    return [{ type: actor.type, entry }];
  });

  const groupNameById = new Map(groups.map((group) => [group.id, group.name]));
  const groupMembers = members.groupMembers();
  const groupPermissions = groupMembers.map(({ groupId, membership }): TGroupMemberPermission => {
    const activeRoles = membership.activeRoles(now);
    return {
      permission: Permission.fromRules<ProjectPermissionSet>({
        rules: rulesOf(
          activeRoles.map((role) => role.toGrant()),
          standardRoles
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

  // Only listed members count as direct: a ghost user's membership is never merged in.
  const directByActorId = new Map(
    members.directMembers().flatMap(({ actor }) => {
      const name = nameOf(actor);
      return name === undefined ? [] : [[actor.id, { actor, name }] as const];
    })
  );
  const mergedPermissions = new PermissionsByRules();
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
      rulesOf(grants.active(now), projectRoles),
      grants,
      groupsOnly ? undefined : folderAccessByActorId.get(actorId)
    );
    return mergedPermissions.of(rules.interpolate(identityOf(actorId, direct?.name ?? username ?? "", attributes)));
  };

  return {
    userPermissions: directMembers.filter(({ type }) => type === ActorType.USER).map(({ entry }) => entry),
    identityPermissions: directMembers.filter(({ type }) => type === ActorType.IDENTITY).map(({ entry }) => entry),
    groupPermissions,
    folderAccessByActorId,
    permissionForActor,
    groupRulesHavePlaceholders: groupMembers.some(({ membership }) =>
      membership.roles.some((role) => JSON.stringify(role.toGrant().toJSON().packedRules ?? []).includes("{{"))
    )
  };
};
