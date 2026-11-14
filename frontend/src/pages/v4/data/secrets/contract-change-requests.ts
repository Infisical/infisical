import type {
  TBulkActOnSecretApprovalRequestsDTO,
  TBulkChangeRequestResult,
  TGetSecretApprovalRequestCount,
  TGetSecretApprovalRequestDetails,
  TGetSecretApprovalRequestList,
  TPerformSecretApprovalRequestMerge,
  TSecretApprovalRequest,
  TSecretApprovalRequestCount,
  TUpdateSecretApprovalRequestStatusDTO,
  TUpdateSecretApprovalReviewStatusDTO
} from "@app/hooks/api/secretApprovalRequest/types";
import type { TSecretImport } from "@app/hooks/api/secretImports/types";

import type { V4Mutation, V4QueryResult } from "../contract";

export type ApprovalRequestDetailsQuery = V4QueryResult<TSecretApprovalRequest> & {
  isError: boolean;
  refetch: () => unknown;
};

export type SecretsChangeRequestsAdapter = {
  useApprovalRequests: (
    dto: TGetSecretApprovalRequestList
  ) => V4QueryResult<{ approvals: TSecretApprovalRequest[]; totalCount: number }>;
  useApprovalRequestCount: (
    dto: TGetSecretApprovalRequestCount
  ) => V4QueryResult<TSecretApprovalRequestCount>;
  useApprovalRequestDetails: (
    dto: TGetSecretApprovalRequestDetails
  ) => V4QueryResult<TSecretApprovalRequest>;
  useApprovalRequestDetailsList: (ids: string[]) => ApprovalRequestDetailsQuery[];
  useSecretImports: (dto: {
    projectId: string;
    environment: string;
    path: string;
    enabled: boolean;
  }) => V4QueryResult<TSecretImport[]>;
  useReviewApprovalRequest: V4Mutation<TUpdateSecretApprovalReviewStatusDTO>;
  useUpdateApprovalRequestStatus: V4Mutation<TUpdateSecretApprovalRequestStatusDTO>;
  useMergeApprovalRequest: V4Mutation<TPerformSecretApprovalRequestMerge>;
  useBulkActOnApprovalRequests: V4Mutation<
    TBulkActOnSecretApprovalRequestsDTO,
    TBulkChangeRequestResult[]
  >;
};
