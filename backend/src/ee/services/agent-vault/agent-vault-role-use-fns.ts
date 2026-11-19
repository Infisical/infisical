import { createMongoAbility, subject } from "@casl/ability";

import { ProjectMembershipRole, ProjectType } from "@app/db/schemas";
import { buildProjectPermissionRules } from "@app/ee/services/permission/permission-service";
import {
  ProjectPermissionAgentVaultAccessBundleActions,
  ProjectPermissionSet,
  ProjectPermissionSub
} from "@app/ee/services/permission/project-permission";
import { conditionsMatcher } from "@app/lib/casl";
import { TRoleDALFactory } from "@app/services/role/role-dal";

import { TAgentVaultAccessBundleDALFactory } from "../agent-vault-access-bundle/agent-vault-access-bundle-dal";

export type TAgentVaultUseTarget =
  | { subjectType: ProjectPermissionSub.AgentVaultAccessBundles; field: "accessBundleId"; id: string }
  | { subjectType: ProjectPermissionSub.AgentVaultServices; field: "serviceId"; id: string }
  | { subjectType: ProjectPermissionSub.AgentVaultSkills; field: "skillId"; id: string };

export const bundleUseTargets = (accessBundleIds: string[]): TAgentVaultUseTarget[] =>
  accessBundleIds.map((id) => ({
    subjectType: ProjectPermissionSub.AgentVaultAccessBundles,
    field: "accessBundleId",
    id
  }));

/**
 * Who can use something: Admin, and every custom role whose rules allow `use` on any of the targets, with how many
 * members hold each. A service or skill passes itself and every bundle that holds it, since using a bundle covers what
 * it holds. Only roles count, because Agent Vault leaves additional privileges out of its permissions.
 */
export const findRolesThatCanUse = async (
  {
    roleDAL,
    agentVaultAccessBundleDAL
  }: {
    roleDAL: Pick<TRoleDALFactory, "find">;
    agentVaultAccessBundleDAL: Pick<TAgentVaultAccessBundleDALFactory, "countRoleHolders">;
  },
  { projectId, targets }: { projectId: string; targets: TAgentVaultUseTarget[] }
) => {
  const [customRoles, holders] = await Promise.all([
    roleDAL.find({ projectId }, { sort: [["name", "asc"]] }),
    agentVaultAccessBundleDAL.countRoleHolders(projectId)
  ]);
  // Bundles, services and skills all name the action `use`.
  const canUseAny = (permissions: unknown) => {
    const ability = createMongoAbility<ProjectPermissionSet>(
      buildProjectPermissionRules(
        [{ role: ProjectMembershipRole.Custom, permissions: permissions ?? [] }],
        ProjectType.AgentVault
      ),
      { conditionsMatcher }
    );
    return targets.some((target) =>
      ability.can(
        ProjectPermissionAgentVaultAccessBundleActions.Use as never,
        subject(target.subjectType, { [target.field]: target.id }) as never
      )
    );
  };

  return [
    {
      id: null,
      slug: ProjectMembershipRole.Admin as string,
      name: "Admin",
      isBuiltIn: true,
      memberCount: holders.get(ProjectMembershipRole.Admin) ?? 0
    },
    ...customRoles
      .filter((role) => canUseAny(role.permissions))
      .map((role) => ({
        id: role.id as string | null,
        slug: role.slug,
        name: role.name,
        isBuiltIn: false,
        memberCount: holders.get(role.id) ?? 0
      }))
  ];
};
