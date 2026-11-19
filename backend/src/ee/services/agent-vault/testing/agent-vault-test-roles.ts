import { MongoAbility, RawRuleOf } from "@casl/ability";

import {
  ProjectPermissionAgentVaultAccessBundleActions,
  ProjectPermissionAgentVaultProxyActions,
  ProjectPermissionAgentVaultSessionActions,
  ProjectPermissionSet,
  ProjectPermissionSub
} from "@app/ee/services/permission/project-permission";

/**
 * For tests: the rules of the "Member" role the role migration makes from the retired built-in Member, plus the bundle
 * roles that replace grants, as one role set. `accessBundleIds` are the bundles the actor used to be granted.
 */
export const agentVaultMemberTestRules = (
  accessBundleIds: string[] = []
): RawRuleOf<MongoAbility<ProjectPermissionSet>>[] => [
  {
    action: [
      ProjectPermissionAgentVaultSessionActions.Read,
      ProjectPermissionAgentVaultSessionActions.Create,
      ProjectPermissionAgentVaultSessionActions.Edit,
      ProjectPermissionAgentVaultSessionActions.Revoke,
      ProjectPermissionAgentVaultSessionActions.CreateWithInlineSkills
    ],
    subject: ProjectPermissionSub.AgentVaultSessions
  },
  { action: [ProjectPermissionAgentVaultProxyActions.Read], subject: ProjectPermissionSub.AgentVaultProxies },
  ...(accessBundleIds.length
    ? [
        {
          action: [
            ProjectPermissionAgentVaultAccessBundleActions.Read,
            ProjectPermissionAgentVaultAccessBundleActions.Use
          ],
          subject: ProjectPermissionSub.AgentVaultAccessBundles,
          conditions: { accessBundleId: { $in: accessBundleIds } }
        } as RawRuleOf<MongoAbility<ProjectPermissionSet>>
      ]
    : [])
];

// A reach DAL for tests whose project holds these ids.
export const agentVaultTestReachDAL = ({
  accessBundleIds = [],
  serviceIds = [],
  skillIds = []
}: {
  accessBundleIds?: string[];
  serviceIds?: string[];
  skillIds?: string[];
} = {}) => ({
  findAccessBundleIds: async () => accessBundleIds,
  findServiceIds: async () => serviceIds,
  findSkillIds: async () => skillIds,
  findServiceIdsInAnyBundle: async () => serviceIds,
  findSkillIdsInAnyBundle: async () => skillIds
});
