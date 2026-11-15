import type {
  useAddAgentVaultAccessBundleMembers,
  useAddAgentVaultAccessBundleService,
  useAddAgentVaultAccessBundleSkill,
  useCreateAgentVaultAccessBundle,
  useCreateAgentVaultProxy,
  useCreateAgentVaultService,
  useCreateAgentVaultSkill,
  useCreateAgentVaultVariable,
  useDeleteAgentVaultAccessBundle,
  useDeleteAgentVaultPersonalValues,
  useDeleteAgentVaultProxy,
  useDeleteAgentVaultService,
  useDeleteAgentVaultSkill,
  useDeleteAgentVaultVariable,
  useListAgentVaultMcpTools,
  useRemoveAgentVaultAccessBundleService,
  useRemoveAgentVaultAccessBundleSkill,
  useRestoreAgentVaultSkillVersion,
  useRevealAgentVaultVariableValue,
  useRevokeAgentVaultAccessBundleMembers,
  useRevokeAgentVaultProxyAccess,
  useRotateAgentVaultProxyToken,
  useSetAgentVaultPersonalValues,
  useUpdateAgentVaultAccessBundle,
  useUpdateAgentVaultProxy,
  useUpdateAgentVaultService,
  useUpdateAgentVaultSkill,
  useUpdateAgentVaultVariable
} from "@app/hooks/api/agentVault/mutations";
import type {
  useAgentVaultVariableKeyStatus,
  useGetAgentVaultAccessBundle,
  useGetAgentVaultSkill,
  useGetAgentVaultSkillVersion,
  useListAgentVaultAccessBundleMembers,
  useListAgentVaultAccessBundles,
  useListAgentVaultAccessBundleSkills,
  useListAgentVaultProxies,
  useListAgentVaultServices,
  useListAgentVaultSkills,
  useListAgentVaultSkillVersions,
  useListAgentVaultVariables,
  useListAvailableAgentVaultAccessBundleMembers
} from "@app/hooks/api/agentVault/queries";
import type { TAgentVaultProxyCa } from "@app/hooks/api/agentVault/types";

import type { V4Mutation, V4QueryResult } from "../contract";

type QueryHook = (...args: never[]) => { data: unknown };
type MutationHook = (...args: never[]) => {
  mutateAsync: (...args: never[]) => unknown;
};

type QueryOf<H extends QueryHook> = (...args: Parameters<H>) => V4QueryResult<
  NonNullable<ReturnType<H>["data"]>
> & {
  isFetching?: boolean;
};

type ProjectMutationOf<H extends MutationHook> = (
  ...args: Parameters<H>
) => ReturnType<
  V4Mutation<
    Parameters<ReturnType<H>["mutateAsync"]>[0],
    Awaited<ReturnType<ReturnType<H>["mutateAsync"]>>
  >
>;

export type AgentVaultResourcesAdapter = {
  useAccessBundles: QueryOf<typeof useListAgentVaultAccessBundles>;
  useAccessBundle: QueryOf<typeof useGetAgentVaultAccessBundle>;
  useCreateAccessBundle: ProjectMutationOf<typeof useCreateAgentVaultAccessBundle>;
  useUpdateAccessBundle: ProjectMutationOf<typeof useUpdateAgentVaultAccessBundle>;
  useDeleteAccessBundle: ProjectMutationOf<typeof useDeleteAgentVaultAccessBundle>;
  useAccessBundleMembers: QueryOf<typeof useListAgentVaultAccessBundleMembers>;
  useAvailableAccessBundleMembers: QueryOf<typeof useListAvailableAgentVaultAccessBundleMembers>;
  useAddAccessBundleMembers: ProjectMutationOf<typeof useAddAgentVaultAccessBundleMembers>;
  useRevokeAccessBundleMembers: ProjectMutationOf<typeof useRevokeAgentVaultAccessBundleMembers>;

  useServices: QueryOf<typeof useListAgentVaultServices>;
  useCreateService: ProjectMutationOf<typeof useCreateAgentVaultService>;
  useUpdateService: ProjectMutationOf<typeof useUpdateAgentVaultService>;
  useDeleteService: ProjectMutationOf<typeof useDeleteAgentVaultService>;
  useAddAccessBundleServices: ProjectMutationOf<typeof useAddAgentVaultAccessBundleService>;
  useRemoveAccessBundleService: ProjectMutationOf<typeof useRemoveAgentVaultAccessBundleService>;
  useListMcpTools: ProjectMutationOf<typeof useListAgentVaultMcpTools>;
  useSetPersonalValues: ProjectMutationOf<typeof useSetAgentVaultPersonalValues>;
  useDeletePersonalValues: ProjectMutationOf<typeof useDeleteAgentVaultPersonalValues>;

  useVariables: QueryOf<typeof useListAgentVaultVariables>;
  useVariableKeyStatus: typeof useAgentVaultVariableKeyStatus;
  useCreateVariable: ProjectMutationOf<typeof useCreateAgentVaultVariable>;
  useUpdateVariable: ProjectMutationOf<typeof useUpdateAgentVaultVariable>;
  useDeleteVariable: ProjectMutationOf<typeof useDeleteAgentVaultVariable>;
  useRevealVariableValue: ProjectMutationOf<typeof useRevealAgentVaultVariableValue>;

  useSkills: QueryOf<typeof useListAgentVaultSkills>;
  useSkill: QueryOf<typeof useGetAgentVaultSkill>;
  useSkillVersions: QueryOf<typeof useListAgentVaultSkillVersions>;
  useSkillVersion: QueryOf<typeof useGetAgentVaultSkillVersion>;
  useAccessBundleSkills: QueryOf<typeof useListAgentVaultAccessBundleSkills>;
  useCreateSkill: ProjectMutationOf<typeof useCreateAgentVaultSkill>;
  useUpdateSkill: ProjectMutationOf<typeof useUpdateAgentVaultSkill>;
  useRestoreSkillVersion: ProjectMutationOf<typeof useRestoreAgentVaultSkillVersion>;
  useDeleteSkill: ProjectMutationOf<typeof useDeleteAgentVaultSkill>;
  useAddAccessBundleSkills: ProjectMutationOf<typeof useAddAgentVaultAccessBundleSkill>;
  useRemoveAccessBundleSkill: ProjectMutationOf<typeof useRemoveAgentVaultAccessBundleSkill>;

  useProxies: QueryOf<typeof useListAgentVaultProxies>;
  useCreateProxy: ProjectMutationOf<typeof useCreateAgentVaultProxy>;
  useUpdateProxy: ProjectMutationOf<typeof useUpdateAgentVaultProxy>;
  useDeleteProxy: ProjectMutationOf<typeof useDeleteAgentVaultProxy>;
  useRotateProxyToken: ProjectMutationOf<typeof useRotateAgentVaultProxyToken>;
  useRevokeProxyAccess: ProjectMutationOf<typeof useRevokeAgentVaultProxyAccess>;
  useProxyCa: V4Mutation<string, TAgentVaultProxyCa>;
};
