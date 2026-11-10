import type {
  TCreateProjectFolderGrantDTO,
  TDeleteProjectFolderGrantDTO,
  TProjectFolderGrant
} from "@app/hooks/api/projectFolderGrants/types";
import type { Project } from "@app/hooks/api/projects/types";
import type { TSecretFolder } from "@app/hooks/api/secretFolders/types";
import type { TGetSecretBlindIndexStatusResponse } from "@app/hooks/api/secretInsights/types";
import type {
  TCreateSecretValidationRuleDTO,
  TDeleteSecretValidationRuleDTO,
  TSecretValidationRule,
  TUpdateSecretValidationRuleDTO
} from "@app/hooks/api/secretValidationRules/types";

import type { V4Mutation, V4QueryResult } from "../contract";

export type SecretPolicyGates = {
  allowCrossProjectSecretSharing: boolean;
  crossProjectSecretSharingInPlan: boolean;
  paramsFolderSecretDetectionEnabled: boolean;
};

export type FolderGrantsUsage = { isChecking: boolean; isError: boolean; total: number };

export type SecretPoliciesAdapter = {
  useGates: (orgId: string) => V4QueryResult<SecretPolicyGates>;
  useValidationRules: (
    projectId: string,
    options: { enabled: boolean }
  ) => V4QueryResult<TSecretValidationRule[]>;
  useCreateValidationRule: V4Mutation<TCreateSecretValidationRuleDTO, TSecretValidationRule>;
  useUpdateValidationRule: V4Mutation<TUpdateSecretValidationRuleDTO, TSecretValidationRule>;
  useDeleteValidationRule: V4Mutation<TDeleteSecretValidationRuleDTO, TSecretValidationRule>;
  useBlindIndexStatus: (
    projectId: string,
    options: { enabled: boolean }
  ) => V4QueryResult<TGetSecretBlindIndexStatusResponse>;
  useEnableBlindIndex: V4Mutation<{ projectId: string }, { message: string }>;
  useFolderGrants: (
    projectId: string,
    options: { enabled: boolean }
  ) => V4QueryResult<TProjectFolderGrant[]>;
  useFolderGrantsUsage: (
    grantIds: string[],
    projectId: string,
    options: { enabled: boolean }
  ) => FolderGrantsUsage;
  useCreateFolderGrant: V4Mutation<TCreateProjectFolderGrantDTO, TProjectFolderGrant>;
  useDeleteFolderGrant: V4Mutation<TDeleteProjectFolderGrantDTO, TProjectFolderGrant>;
  useRevokeFolderGrants: V4Mutation<{ grants: TProjectFolderGrant[]; sourceProjectId: string }>;
  useFolders: (dto: {
    projectId: string;
    environment: string;
    path: string;
    enabled: boolean;
  }) => V4QueryResult<TSecretFolder[]>;
  useShareTargetProjects: () => V4QueryResult<Project[]>;
};
