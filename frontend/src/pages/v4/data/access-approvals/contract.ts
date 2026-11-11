import type {
  TAccessApprovalPolicy,
  TAccessApprovalRequest,
  TAccessRequestCount,
  TCreateAccessRequestDTO
} from "@app/hooks/api/accessApproval/types";
import type { TDelegatedApprovalOption } from "@app/hooks/api/delegatedApprovals/types";
import type { TWorkspaceUser } from "@app/hooks/api/users/types";

import type { V4Mutation, V4QueryResult } from "../contract";

export type AccessRequestMember = Pick<
  TWorkspaceUser["user"],
  "id" | "username" | "email" | "firstName" | "lastName" | "isOrgMembershipActive"
>;

export type AccessRequestGroup = { id: string; name: string };

export type AccessRequestsLicense = { secretApproval: boolean; honeyTokens: boolean };

type RequestTarget = { requestId: string; projectSlug: string };

export type AccessApprovalsAdapter = {
  useLicense: (orgId: string) => V4QueryResult<AccessRequestsLicense>;
  usePolicies: (projectSlug: string) => V4QueryResult<TAccessApprovalPolicy[]>;
  useRequests: (dto: {
    projectSlug: string;
    envSlug?: string;
    authorUserId?: string;
  }) => V4QueryResult<TAccessApprovalRequest[]>;
  useRequestCount: (projectSlug: string) => V4QueryResult<TAccessRequestCount>;
  useMembers: (projectId: string) => V4QueryResult<AccessRequestMember[]>;
  useGroups: (projectId: string) => V4QueryResult<AccessRequestGroup[]>;
  useDelegatedApprovalOptions: (enabled: boolean) => V4QueryResult<TDelegatedApprovalOption[]>;
  useIsDispatchRetrying: () => (requestId: string) => boolean;
  useCreateRequest: V4Mutation<TCreateAccessRequestDTO>;
  useReviewRequest: V4Mutation<
    RequestTarget & { status: "approved" | "rejected"; bypassReason?: string }
  >;
  useRevokeRequest: V4Mutation<RequestTarget>;
  useRetryDispatch: V4Mutation<RequestTarget>;
  useCancelRequest: V4Mutation<RequestTarget>;
};
