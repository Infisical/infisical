import { MongoAbility } from "@casl/ability";

import { hasSecretReadValueOrDescribePermission } from "@app/ee/services/permission/permission-fns";
import { ProjectPermissionSecretActions, ProjectPermissionSet } from "@app/ee/services/permission/project-permission";

export type TInsightsDuplicationGroup = {
  secrets: { key: string; environment: { name: string; slug: string }; secretPath: string; secretTags?: string[] }[];
};

// Keep only the secrets in each duplication group that the actor can describe, and only groups that
// still contain more than one. A group reduced to a single visible secret is no longer a duplication
// from the actor's perspective, so it cannot reveal a secret in an environment/path they cannot access.
export const filterVisibleDuplicationGroups = (
  groups: TInsightsDuplicationGroup[],
  permission: MongoAbility<ProjectPermissionSet>
): TInsightsDuplicationGroup[] =>
  groups
    .map((group) => ({
      secrets: group.secrets.filter((s) =>
        hasSecretReadValueOrDescribePermission(permission, ProjectPermissionSecretActions.DescribeSecret, {
          environment: s.environment.slug,
          secretPath: s.secretPath,
          secretName: s.key,
          secretTags: s.secretTags
        })
      )
    }))
    .filter((group) => group.secrets.length > 1);
