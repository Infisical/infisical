import {
  useBulkActOnSecretApprovalRequests,
  usePerformSecretApprovalRequestMerge,
  useUpdateSecretApprovalRequestStatus,
  useUpdateSecretApprovalReviewStatus
} from "@app/hooks/api/secretApprovalRequest/mutation";
import {
  useGetSecretApprovalRequestCount,
  useGetSecretApprovalRequestDetails,
  useGetSecretApprovalRequestDetailsList,
  useGetSecretApprovalRequests
} from "@app/hooks/api/secretApprovalRequest/queries";
import { useGetSecretImports } from "@app/hooks/api/secretImports/queries";

import type { SecretsChangeRequestsAdapter } from "./contract-change-requests";

export const secretsChangeRequestsLive: SecretsChangeRequestsAdapter = {
  useApprovalRequests: useGetSecretApprovalRequests,
  useApprovalRequestCount: useGetSecretApprovalRequestCount,
  useApprovalRequestDetails: useGetSecretApprovalRequestDetails,
  useApprovalRequestDetailsList: (ids) => useGetSecretApprovalRequestDetailsList({ ids }),
  useSecretImports: ({ projectId, environment, path, enabled }) =>
    useGetSecretImports({ projectId, environment, path, options: { enabled } }),
  useReviewApprovalRequest: useUpdateSecretApprovalReviewStatus,
  useUpdateApprovalRequestStatus: useUpdateSecretApprovalRequestStatus,
  useMergeApprovalRequest: usePerformSecretApprovalRequestMerge,
  useBulkActOnApprovalRequests: useBulkActOnSecretApprovalRequests
};
