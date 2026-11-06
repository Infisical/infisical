import { useGetProjectSecretsOverview, useGetSecretValue } from "@app/hooks/api/dashboard/queries";
import { useCreateWsEnvironment, useGetWorkspaceById } from "@app/hooks/api/projects/queries";
import {
  usePerformSecretApprovalRequestMerge,
  useUpdateSecretApprovalRequestStatus,
  useUpdateSecretApprovalReviewStatus
} from "@app/hooks/api/secretApprovalRequest/mutation";
import {
  useGetSecretApprovalRequestCount,
  useGetSecretApprovalRequestDetails,
  useGetSecretApprovalRequests
} from "@app/hooks/api/secretApprovalRequest/queries";
import {
  useCreateFolder,
  useDeleteFolder,
  useUpdateFolder
} from "@app/hooks/api/secretFolders/queries";
import {
  useCreateSecretV3,
  useDeleteSecretBatch,
  useDeleteSecretV3,
  useUpdateSecretV3
} from "@app/hooks/api/secrets/mutations";
import { useGetSecretReferences, useGetSecretReferenceTree } from "@app/hooks/api/secrets/queries";
import { useGetWsTags } from "@app/hooks/api/tags/queries";

import type { SecretsAdapter } from "./contract";
import { secretsFlowsLive } from "./live-flows";

export const secretsLive: SecretsAdapter = {
  ...secretsFlowsLive,
  useProject: useGetWorkspaceById,
  useCreateEnvironment: useCreateWsEnvironment,
  useTags: useGetWsTags,
  useOverview: useGetProjectSecretsOverview,
  useSecretValue: useGetSecretValue,
  useSecretReferenceTree: useGetSecretReferenceTree,
  useSecretReferences: useGetSecretReferences,
  useCreateSecret: useCreateSecretV3,
  useUpdateSecret: useUpdateSecretV3,
  useDeleteSecret: useDeleteSecretV3,
  useDeleteSecretBatch,
  useCreateFolder,
  useUpdateFolder,
  useDeleteFolder,
  useApprovalRequests: useGetSecretApprovalRequests,
  useApprovalRequestCount: useGetSecretApprovalRequestCount,
  useApprovalRequestDetails: useGetSecretApprovalRequestDetails,
  useReviewApprovalRequest: useUpdateSecretApprovalReviewStatus,
  useUpdateApprovalRequestStatus: useUpdateSecretApprovalRequestStatus,
  useMergeApprovalRequest: usePerformSecretApprovalRequestMerge
};
