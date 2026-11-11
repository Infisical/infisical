import { MongoAbility, RawRuleOf } from "@casl/ability";

import { SecretFolderRole } from "@app/db/schemas";
import { scopedGrants } from "@app/domains/platform/access-control/ce/module";
import { ProjectPermissionSet } from "@app/domains/platform/projects/ce/module";
import { NotFoundError } from "@app/lib/errors";

import { FOLDER_SCOPED_DENY_RULES, SECRET_FOLDER_ROLE_PERMISSIONS } from "./folder-roles";

// A folder grant, with the folder's environment and path resolved.
export type TFolderGrant = {
  id: string;
  folderId: string;
  role: string;
  environmentSlug: string;
  secretPath: string;
};

export const filterOverriddenFolderScopedDenyRules = (
  rules: RawRuleOf<MongoAbility<ProjectPermissionSet>>[]
): RawRuleOf<MongoAbility<ProjectPermissionSet>>[] => {
  const toArray = <T>(value: T | T[]): T[] => (Array.isArray(value) ? value : [value]);

  const allowedPairs = new Set<string>();
  rules
    .filter((rule) => !rule.inverted)
    .forEach((rule) => {
      toArray(rule.subject as string | string[]).forEach((sub) => {
        toArray(rule.action).forEach((action) => allowedPairs.add(`${sub}:${action}`));
      });
    });

  return rules.flatMap((rule) => {
    if (!rule.inverted) return [rule];
    return toArray(rule.subject as string | string[]).flatMap((sub) => {
      const deniedActions = toArray(rule.action).filter((action) => !allowedPairs.has(`${sub}:${action}`));
      if (!deniedActions.length) return [];
      return [{ ...rule, subject: sub, action: deniedActions } as RawRuleOf<MongoAbility<ProjectPermissionSet>>];
    });
  });
};

const FOLDER_SCOPED_DENY_RULES_BY_ROLE = Object.fromEntries(
  Object.values(SecretFolderRole).map((role) => [
    role,
    filterOverriddenFolderScopedDenyRules([
      ...FOLDER_SCOPED_DENY_RULES,
      ...SECRET_FOLDER_ROLE_PERMISSIONS[role]
    ]).filter((rule) => rule.inverted)
  ])
) as Record<SecretFolderRole, RawRuleOf<MongoAbility<ProjectPermissionSet>>[]>;

// The rules a set of folder grants adds: each grant resets what is allowed at its folder (denies, then the folder
// role's allows), every deny before every allow so one grant never undoes another's allow at the same path.
export const buildFolderScopedPrivilegeRules = (
  grants: TFolderGrant[]
): RawRuleOf<MongoAbility<ProjectPermissionSet>>[] =>
  scopedGrants({
    grants: grants.map((grant) => {
      if (!Object.values(SecretFolderRole).includes(grant.role as SecretFolderRole)) {
        throw new NotFoundError({
          name: "FolderRoleInvalid",
          message: `Folder access role '${grant.role}' on grant with ID '${grant.id}' not found`
        });
      }
      const role = grant.role as SecretFolderRole;
      return {
        deny: FOLDER_SCOPED_DENY_RULES_BY_ROLE[role],
        allow: SECRET_FOLDER_ROLE_PERMISSIONS[role],
        conditions: { environment: grant.environmentSlug, secretPath: grant.secretPath }
      };
    })
  });
