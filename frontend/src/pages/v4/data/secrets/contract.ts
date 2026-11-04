import type {
  DashboardProjectSecretsOverview,
  DashboardSecretValue,
  TGetDashboardProjectSecretsOverviewDTO,
  TGetSecretValueDTO
} from "@app/hooks/api/dashboard/types";
import type { Project } from "@app/hooks/api/projects/types";
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
  TUpdateSecretsV3DTO
} from "@app/hooks/api/secrets/types";
import type { UserWsTags } from "@app/hooks/api/tags/types";

import type { V4Mutation, V4QueryResult } from "../contract";

export type SecretsAdapter = {
  useProject: (projectId: string) => V4QueryResult<Project>;
  useTags: (projectId: string) => V4QueryResult<UserWsTags>;
  useOverview: (
    dto: TGetDashboardProjectSecretsOverviewDTO
  ) => V4QueryResult<DashboardProjectSecretsOverview> & { refetch: () => unknown };
  useSecretValue: (
    dto: TGetSecretValueDTO,
    options?: { enabled?: boolean }
  ) => V4QueryResult<DashboardSecretValue>;
  useCreateSecret: V4Mutation<TCreateSecretsV3DTO>;
  useUpdateSecret: V4Mutation<TUpdateSecretsV3DTO>;
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
