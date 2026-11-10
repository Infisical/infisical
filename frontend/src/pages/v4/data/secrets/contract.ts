import type {
  DashboardProjectSecretsOverview,
  DashboardSecretValue,
  TGetDashboardProjectSecretsOverviewDTO,
  TGetSecretValueDTO
} from "@app/hooks/api/dashboard/types";
import type { CreateEnvironmentDTO, Project, ProjectEnv } from "@app/hooks/api/projects/types";
import type {
  TGetSecretApprovalRequestCount,
  TGetSecretApprovalRequestDetails,
  TGetSecretApprovalRequestList,
  TPerformSecretApprovalRequestMerge,
  TSecretApprovalRequest,
  TSecretApprovalRequestCount,
  TUpdateSecretApprovalRequestStatusDTO,
  TUpdateSecretApprovalReviewStatusDTO
} from "@app/hooks/api/secretApprovalRequest/types";
import type {
  TCreateFolderDTO,
  TDeleteFolderDTO,
  TUpdateFolderDTO
} from "@app/hooks/api/secretFolders/types";
import type {
  TCreateSecretsV3DTO,
  TDeleteSecretBatchDTO,
  TDeleteSecretsV3DTO,
  TGetSecretReferencesDTO,
  TGetSecretReferenceTreeDTO,
  TSecretDependencyTreeNode,
  TSecretReferenceTraceNode,
  TUpdateSecretsV3DTO
} from "@app/hooks/api/secrets/types";
import type { CreateTagDTO, UserWsTags, WsTag } from "@app/hooks/api/tags/types";

import type { V4ConfigurableMutation, V4Mutation, V4QueryResult } from "../contract";
import type { SecretsFlowsAdapter } from "./contract-flows";

export type SecretsAdapter = SecretsFlowsAdapter & {
  useProject: (projectId: string) => V4QueryResult<Project> & { refetch?: () => unknown };
  useCreateEnvironment: V4Mutation<CreateEnvironmentDTO, ProjectEnv>;
  useTags: (projectId: string) => V4QueryResult<UserWsTags>;
  useCreateTag: V4Mutation<CreateTagDTO, WsTag>;
  useOverview: (
    dto: TGetDashboardProjectSecretsOverviewDTO,
    options?: { enabled?: boolean }
  ) => V4QueryResult<DashboardProjectSecretsOverview> & { refetch: () => unknown };
  useSecretValue: (
    dto: TGetSecretValueDTO,
    options?: { enabled?: boolean }
  ) => V4QueryResult<DashboardSecretValue> & { isFetching?: boolean };
  useSecretReferenceTree: (
    dto: TGetSecretReferenceTreeDTO
  ) => V4QueryResult<{ tree: TSecretReferenceTraceNode; value: string }>;
  useSecretReferences: (
    dto: TGetSecretReferencesDTO
  ) => V4QueryResult<{ tree: TSecretDependencyTreeNode }>;
  useCreateSecret: V4ConfigurableMutation<TCreateSecretsV3DTO>;
  useUpdateSecret: V4ConfigurableMutation<TUpdateSecretsV3DTO>;
  useDeleteSecret: V4Mutation<TDeleteSecretsV3DTO>;
  useDeleteSecretBatch: V4Mutation<TDeleteSecretBatchDTO>;
  useCreateFolder: V4Mutation<TCreateFolderDTO>;
  useUpdateFolder: V4Mutation<TUpdateFolderDTO>;
  useDeleteFolder: V4Mutation<TDeleteFolderDTO>;
  useApprovalRequests: (
    dto: TGetSecretApprovalRequestList
  ) => V4QueryResult<{ approvals: TSecretApprovalRequest[]; totalCount: number }>;
  useApprovalRequestCount: (
    dto: TGetSecretApprovalRequestCount
  ) => V4QueryResult<TSecretApprovalRequestCount>;
  useApprovalRequestDetails: (
    dto: TGetSecretApprovalRequestDetails
  ) => V4QueryResult<TSecretApprovalRequest>;
  useReviewApprovalRequest: V4Mutation<TUpdateSecretApprovalReviewStatusDTO>;
  useUpdateApprovalRequestStatus: V4Mutation<TUpdateSecretApprovalRequestStatusDTO>;
  useMergeApprovalRequest: V4Mutation<TPerformSecretApprovalRequestMerge>;
};
