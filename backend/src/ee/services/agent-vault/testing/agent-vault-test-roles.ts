import { MongoAbility, RawRuleOf } from "@casl/ability";

import {
  ProjectPermissionAgentVaultAccessBundleActions,
  ProjectPermissionAgentVaultProxyActions,
  ProjectPermissionAgentVaultSessionActions,
  ProjectPermissionSet,
  ProjectPermissionSub
} from "@app/ee/services/permission/project-permission";

/**
 * For tests: the rules of the "Member" role the role migration makes, plus the role of each bundle in `accessBundleIds`,
 * which lets its holder use that bundle, as one role set.
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
