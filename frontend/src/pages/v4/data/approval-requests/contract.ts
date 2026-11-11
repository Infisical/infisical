import type {
  TApprovalPolicy,
  TDeleteApprovalPolicyDTO,
  TListApprovalPoliciesDTO,
  TUpdateApprovalPolicyDTO
} from "@app/hooks/api/approvalPolicies/types";
import type {
  TApprovalRequest,
  TApproveApprovalRequestDTO,
  TCancelApprovalRequestDTO,
  TGetApprovalRequestByIdDTO,
  TListApprovalRequestsDTO,
  TRejectApprovalRequestDTO
} from "@app/hooks/api/approvalRequests/types";
import type { TCertificateProfileWithDetails } from "@app/hooks/api/certificateProfiles/types";
import type { TCertificateRequestDetails } from "@app/hooks/api/certificates/types";

import type { V4Mutation, V4QueryResult } from "../contract";

export type ApprovalViewer = { isAdmin: boolean; groupIds: string[] };

export type ApproverDirectory = {
  users: { id: string; label: string }[];
  groups: { id: string; label: string }[];
};

export type ApprovalApplication = { id: string; name: string };

export type ApprovalRequestsAdapter = {
  useViewer: (projectId: string) => V4QueryResult<ApprovalViewer>;
  useRequests: (dto: TListApprovalRequestsDTO) => V4QueryResult<TApprovalRequest[]>;
  useRequest: (dto: TGetApprovalRequestByIdDTO) => V4QueryResult<TApprovalRequest>;
  usePolicies: (
    dto: TListApprovalPoliciesDTO,
    options: { enabled: boolean }
  ) => V4QueryResult<TApprovalPolicy[]>;
  useApprovers: (
    projectId: string,
    options: { includeGroupMembers: boolean }
  ) => V4QueryResult<ApproverDirectory>;
  useApplications: (applicationIds: string[]) => V4QueryResult<ApprovalApplication[]>;
  useApplication: (applicationId: string) => V4QueryResult<ApprovalApplication>;
  useProfile: (profileId: string) => V4QueryResult<TCertificateProfileWithDetails>;
  useCertificateRequest: (requestId: string) => V4QueryResult<TCertificateRequestDetails>;
  useApprove: V4Mutation<TApproveApprovalRequestDTO, TApprovalRequest>;
  useReject: V4Mutation<TRejectApprovalRequestDTO, TApprovalRequest>;
  useCancel: V4Mutation<TCancelApprovalRequestDTO, TApprovalRequest>;
  useUpdatePolicy: V4Mutation<TUpdateApprovalPolicyDTO, TApprovalPolicy>;
  useDeletePolicy: V4Mutation<TDeleteApprovalPolicyDTO, string>;
};
