import type {
  TAccessApprovalPolicy,
  TCreateAccessPolicyDTO,
  TDeleteSecretPolicyDTO as TDeleteAccessPolicyDTO,
  TUpdateAccessPolicyDTO
} from "@app/hooks/api/accessApproval/types";
import type { AppConnection } from "@app/hooks/api/appConnections/enums";
import type { TAvailableAppConnection } from "@app/hooks/api/appConnections/types";
import type { TDelegatedApprovalOption } from "@app/hooks/api/delegatedApprovals/types";
import type { TGroupMembership } from "@app/hooks/api/groups/types";
import type {
  TCreateSecretPolicyDTO,
  TDeleteSecretPolicyDTO,
  TSecretApprovalPolicy,
  TUpdateSecretPolicyDTO
} from "@app/hooks/api/secretApproval/types";
import type { TWorkspaceUser } from "@app/hooks/api/users/types";

import type { V4Mutation, V4QueryResult } from "../contract";

export type ApprovalPolicyGates = { secretApproval: boolean; enterpriseAppConnections: boolean };

export type RefetchableQuery<T> = V4QueryResult<T> & {
  isFetching: boolean;
  refetch: () => unknown;
};

export type ApproverOptions = {
  members: TWorkspaceUser[];
  groups: TGroupMembership[];
  isError: boolean;
  isFetching: boolean;
  refetch: () => void;
};

export type ApprovalPoliciesAdapter = {
  useGates: (orgId: string) => V4QueryResult<ApprovalPolicyGates>;
  useChangePolicies: (
    projectId: string,
    options: { enabled: boolean }
  ) => RefetchableQuery<TSecretApprovalPolicy[]>;
  useAccessPolicies: (
    projectSlug: string,
    options: { enabled: boolean }
  ) => RefetchableQuery<TAccessApprovalPolicy[]>;
  useApproverOptions: (
    projectId: string,
    options: { members: boolean; groups: boolean }
  ) => ApproverOptions;
  useCreateChangePolicy: V4Mutation<TCreateSecretPolicyDTO, object>;
  useUpdateChangePolicy: V4Mutation<TUpdateSecretPolicyDTO, object>;
  useDeleteChangePolicy: V4Mutation<TDeleteSecretPolicyDTO, object>;
  useCreateAccessPolicy: V4Mutation<TCreateAccessPolicyDTO, object>;
  useUpdateAccessPolicy: V4Mutation<TUpdateAccessPolicyDTO, object>;
  useDeleteAccessPolicy: V4Mutation<TDeleteAccessPolicyDTO, object>;
  useOpenChangeRequestCount: (dto: {
    projectId: string;
    policyId: string;
    enabled: boolean;
  }) => V4QueryResult<number>;
  useOpenAccessRequestCount: (dto: {
    projectSlug: string;
    policyId: string;
    enabled: boolean;
  }) => V4QueryResult<number>;
  useDelegatedApprovalOptions: (options: {
    enabled: boolean;
  }) => V4QueryResult<TDelegatedApprovalOption[]>;
  useAppConnections: (
    app: AppConnection,
    projectId: string
  ) => V4QueryResult<TAvailableAppConnection[]>;
};
