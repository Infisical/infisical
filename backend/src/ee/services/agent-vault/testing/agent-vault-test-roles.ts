import { MongoAbility, RawRuleOf } from "@casl/ability";

import {
  AGENT_VAULT_SESSION_SELF,
  ProjectPermissionAgentVaultAccessBundleActions,
  ProjectPermissionAgentVaultProxyActions,
  ProjectPermissionAgentVaultSessionActions,
  ProjectPermissionSet,
  ProjectPermissionSub
} from "@app/ee/services/permission/project-permission";

/**
 * For tests: the rules of the "Member" role the role migrations make, plus the role of each bundle in `accessBundleIds`,
 * which lets its holder use that bundle, as one role set. `selfId` is the id the permission service fills in for
 * {{identity.id}}, the actor whose own sessions the role reaches; left out, the rules stay as a role stores them.
 */
export const agentVaultMemberTestRules = (
  accessBundleIds: string[] = [],
  selfId: string = AGENT_VAULT_SESSION_SELF
): RawRuleOf<MongoAbility<ProjectPermissionSet>>[] => [
  {
    action: [
      ProjectPermissionAgentVaultSessionActions.Create,
      ProjectPermissionAgentVaultSessionActions.CreateWithInlineSkills
    ],
    subject: ProjectPermissionSub.AgentVaultSessions
  },
  {
    action: [
      ProjectPermissionAgentVaultSessionActions.Read,
      ProjectPermissionAgentVaultSessionActions.Edit,
      ProjectPermissionAgentVaultSessionActions.Revoke
    ],
    subject: ProjectPermissionSub.AgentVaultSessions,
    conditions: { actorId: { $eq: selfId } }
  } as RawRuleOf<MongoAbility<ProjectPermissionSet>>,
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
