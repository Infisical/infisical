import { createMongoAbility, MongoAbility, RawRuleOf, subject } from "@casl/ability";

import { ProjectMembershipRole, ProjectType, TAdditionalPrivileges } from "@app/db/schemas";
import { FOLDER_SCOPED_DENY_RULES } from "@app/ee/services/permission/folder-roles";
import { buildProjectPermissionRules } from "@app/ee/services/permission/permission-service";
import { ProjectPermissionSub } from "@app/ee/services/permission/project-permission";
import { conditionsMatcher } from "@app/lib/casl";

import {
  TCachedFolderAccess,
  TCachedProjectMemberRole,
  TFolderAccessEntry,
  TFolderAccessRole,
  TProjectMember,
  TProjectMemberActor,
  TProjectMemberRoleRow,
  TResolvedFolder
} from "./folder-permission-types";

type TFolderAccessProbe = { action: string; subject: ProjectPermissionSub };

type TFolderLocation = Pick<TResolvedFolder, "environmentSlug" | "path">;

export type TDistinctProjectRole =
  | { key: string; slug: string; isCustom: false }
  | { key: string; slug: string; isCustom: true; permissions: unknown };

const toArray = <T>(value: T | T[]): T[] => (Array.isArray(value) ? value : [value]);

// The deny list is what defines "secretPath-scoped subject" for folder RBAC, so deriving the probes
// from it keeps them under the same guard test.
export const FOLDER_ACCESS_PROBES: TFolderAccessProbe[] = FOLDER_SCOPED_DENY_RULES.flatMap((rule) =>
  toArray(rule.subject as ProjectPermissionSub | ProjectPermissionSub[]).flatMap((sub) =>
    toArray(rule.action as string | string[]).map((action) => ({ action, subject: sub }))
  )
);

export const BUILT_IN_PROJECT_ROLE_NAMES: Record<string, string> = {
  [ProjectMembershipRole.Admin]: "Admin",
  [ProjectMembershipRole.Member]: "Member",
  [ProjectMembershipRole.Viewer]: "Viewer",
  [ProjectMembershipRole.NoAccess]: "No Access",
  [ProjectMembershipRole.KmsCryptographicOperator]: "Cryptographic Operator"
};

// A built-in role has no row of its own, so it is keyed by slug while a custom role is keyed by id.
// The two never collide: a custom role slugged like a built-in still stores role = 'custom'.
export const folderAccessRoleKey = (role: Pick<TFolderAccessRole, "id" | "slug">) => role.id ?? role.slug;

export const collectDistinctRoles = (entries: { roles: TProjectMemberRoleRow[] }[]): TDistinctProjectRole[] => {
  const byKey = new Map<string, TDistinctProjectRole>();
  entries.forEach(({ roles }) =>
    roles.forEach((row) => {
      if (row.role === ProjectMembershipRole.Custom) {
        if (row.customRoleId && row.customRoleSlug && !byKey.has(row.customRoleId)) {
          byKey.set(row.customRoleId, {
            key: row.customRoleId,
            slug: row.customRoleSlug,
            isCustom: true,
            permissions: row.customRolePermissions ?? []
          });
        }
      } else if (!byKey.has(row.role)) {
        byKey.set(row.role, { key: row.role, slug: row.role, isCustom: false });
      }
    })
  );
  return [...byKey.values()];
};

// Evaluated once per role rather than per actor: the folder subject is the same for everyone, so
// the verdict depends only on the role. Handlebars conditions are therefore never interpolated and
// a templated condition compares literally, which does not match.
export const roleGrantsFolderAccess = (role: TDistinctProjectRole, folder: TFolderLocation) => {
  const rules = buildProjectPermissionRules(
    [
      role.isCustom
        ? { role: ProjectMembershipRole.Custom, permissions: role.permissions }
        : { role: role.slug, permissions: [] }
    ],
    ProjectType.SecretManager
  ) as RawRuleOf<MongoAbility>[];
  const ability = createMongoAbility(rules, { conditionsMatcher });
  // subject() tags the object it receives with the subject type and refuses to retag it, so each probe
  // gets its own copy of the folder fields
  return FOLDER_ACCESS_PROBES.some(({ action, subject: sub }) =>
    ability.can(action, subject(sub, { environment: folder.environmentSlug, secretPath: folder.path }))
  );
};

export const toCachedProjectMemberRole = (row: TProjectMemberRoleRow): TCachedProjectMemberRole | null => {
  const temporal = { isTemporary: row.isTemporary, temporaryAccessEndTime: row.temporaryAccessEndTime };
  if (row.role === ProjectMembershipRole.Custom) {
    if (!row.customRoleId || !row.customRoleSlug || !row.customRoleName) return null;
    return { id: row.customRoleId, slug: row.customRoleSlug, name: row.customRoleName, ...temporal };
  }
  return { id: null, slug: row.role, name: BUILT_IN_PROJECT_ROLE_NAMES[row.role] ?? row.role, ...temporal };
};

export const buildFolderAccess = <TActor extends TProjectMemberActor>(
  entries: TProjectMember<TActor>[],
  folder: TFolderLocation
): TCachedFolderAccess<TActor> => ({
  grantingRoleKeys: collectDistinctRoles(entries)
    .filter((role) => roleGrantsFolderAccess(role, folder))
    .map((role) => role.key),
  actors: entries.map(({ actor, roles }) => ({
    actor,
    roles: roles.map(toCachedProjectMemberRole).filter((role): role is TCachedProjectMemberRole => role !== null)
  }))
});

export const reviveFolderAccess = <TActor extends TProjectMemberActor>(
  parsed: TCachedFolderAccess<TActor>
): TCachedFolderAccess<TActor> => ({
  ...parsed,
  actors: parsed.actors.map((entry) => ({
    ...entry,
    roles: entry.roles.map((role) => ({
      ...role,
      temporaryAccessEndTime: role.temporaryAccessEndTime ? new Date(role.temporaryAccessEndTime) : null
    }))
  }))
});

const isRoleActiveAt = (role: Pick<TCachedProjectMemberRole, "isTemporary" | "temporaryAccessEndTime">, now: Date) =>
  !role.isTemporary || Boolean(role.temporaryAccessEndTime && now < role.temporaryAccessEndTime);

const isBuiltInAdmin = (role: TFolderAccessRole) => role.id === null && role.slug === ProjectMembershipRole.Admin;

const uniqueByKey = (roles: TCachedProjectMemberRole[]) => {
  const seen = new Set<string>();
  return roles.filter((role) => {
    const key = folderAccessRoleKey(role);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const toPublicRole = ({ id, slug, name }: TCachedProjectMemberRole): TFolderAccessRole => ({ id, slug, name });

export const splitFolderAccess = <TActor extends TProjectMemberActor>({
  folderAccess,
  grantByActorId,
  actorIdOf,
  now
}: {
  folderAccess: TCachedFolderAccess<TActor>;
  grantByActorId: Map<string, TAdditionalPrivileges>;
  actorIdOf: (actor: TActor) => string;
  now: Date;
}) => {
  const granting = new Set(folderAccess.grantingRoleKeys);
  const withAccess: TFolderAccessEntry<TActor>[] = [];
  const withoutAccess: TFolderAccessEntry<TActor>[] = [];

  folderAccess.actors.forEach(({ actor, roles }) => {
    const activeRoles = uniqueByKey(roles.filter((role) => isRoleActiveAt(role, now)));
    const isProjectAdmin = activeRoles.some(isBuiltInAdmin);

    const grantingRoles = activeRoles.filter((role) => granting.has(folderAccessRoleKey(role)));
    const grant = grantByActorId.get(actorIdOf(actor)) ?? null;
    // an admin is kept out of withoutAccess even if no probe matched: that list is what the grant
    // picker offers, and a folder grant could only remove privileges from an admin
    if (isProjectAdmin || grantingRoles.length || grant) {
      withAccess.push({
        actor,
        membership: { id: actor.membershipId, isProjectAdmin, roles: grantingRoles.map(toPublicRole) },
        grant
      });
    } else {
      withoutAccess.push({
        actor,
        membership: { id: actor.membershipId, isProjectAdmin, roles: activeRoles.map(toPublicRole) },
        grant: null
      });
    }
  });

  return { withAccess, withoutAccess };
};

export const matchesSearch = (search: string | undefined, fields: (string | null | undefined)[]) => {
  if (!search) return true;
  const term = search.toLowerCase();
  return fields.some((field) => Boolean(field && field.toLowerCase().includes(term)));
};

export const sortFolderAccessEntries = <T>(entries: T[], sortKey: (entry: T) => [name: string, tieBreak: string]) =>
  [...entries].sort((a, b) => {
    const [aName, aTieBreak] = sortKey(a);
    const [bName, bTieBreak] = sortKey(b);
    return aName.toLowerCase().localeCompare(bName.toLowerCase()) || aTieBreak.localeCompare(bTieBreak);
  });

export const paginateFolderAccessEntries = <T>(entries: T[], offset: number, limit: number) => ({
  items: entries.slice(offset, offset + limit),
  totalCount: entries.length
});
