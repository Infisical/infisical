import type { MongoAbility } from "@casl/ability";

import type { ResourceMembership } from "@app/helpers/resourcePermissions";
import type { TAlert, TListAlertsDTO, TUpdateAlertDTO } from "@app/hooks/api/alerts/types";
import type {
  TApprovalPolicy,
  TCreateApprovalPolicyDTO,
  TDeleteApprovalPolicyDTO,
  TUpdateApprovalPolicyDTO
} from "@app/hooks/api/approvalPolicies/types";
import type {
  TCancelCertificateRequestResponse,
  TListCertificateRequestsParams,
  TListCertificateRequestsResponse,
  TCertificate,
  TTriggerCertificateRequestValidationResponse
} from "@app/hooks/api/certificates/types";
import type { TPkiAlertV2 } from "@app/hooks/api/pkiAlertsV2/types";
import type {
  TAddPkiApplicationMemberDTO,
  TAttachPkiApplicationProfilesDTO,
  TCreatePkiApplicationDTO,
  TDeletePkiApplicationDTO,
  TDetachPkiApplicationProfileDTO,
  TListPkiApplicationsParams,
  TListPkiApplicationsResponse,
  TPkiApplication,
  TPkiApplicationMember,
  TPkiApplicationPermissionSet,
  TPkiApplicationProfile,
  TRemovePkiApplicationMemberDTO,
  TUpdatePkiApplicationDTO,
  TUpdatePkiApplicationMemberRoleDTO
} from "@app/hooks/api/pkiApplications/types";
import type { TPkiSync, TTriggerPkiSyncSyncCertificatesDTO } from "@app/hooks/api/pkiSyncs/types";

import type { TListCertificatesDTO } from "../certificates/contract";
import type { V4Mutation, V4QueryResult } from "../contract";
import type { PkiApplicationsEnrollmentAdapter } from "./contract-enrollment";

export type PkiApplicationPermission = {
  permission: MongoAbility<TPkiApplicationPermissionSet>;
  memberships: ResourceMembership[];
};

export type MemberCandidate = { value: string; label: string };

export type MemberCandidates = {
  users: V4QueryResult<MemberCandidate[]>;
  identities: V4QueryResult<MemberCandidate[]>;
  groups: V4QueryResult<MemberCandidate[]>;
};

export type TAddPkiApplicationUserMembersDTO = {
  applicationId: string;
  userIds: string[];
  emails: string[];
  role: string;
};

export type TAddPkiApplicationUserMembersResponse = {
  memberships: TPkiApplicationMember[];
  skipped: string[];
  unresolved: string[];
};

export type PkiApplicationsAdapter = PkiApplicationsEnrollmentAdapter & {
  useApplications: (
    params: TListPkiApplicationsParams
  ) => V4QueryResult<TListPkiApplicationsResponse>;
  useApplicationByName: (name: string) => V4QueryResult<TPkiApplication>;
  useApplicationProfiles: (applicationId: string) => V4QueryResult<TPkiApplicationProfile[]>;
  useApplicationMembers: (applicationId: string) => V4QueryResult<TPkiApplicationMember[]>;
  useApplicationPermissions: (applicationId: string) => V4QueryResult<PkiApplicationPermission>;
  useApplicationCertificates: (
    dto: TListCertificatesDTO
  ) => V4QueryResult<{ certificates: TCertificate[]; totalCount: number }>;
  useMemberCandidates: (projectId: string, enabled: boolean) => MemberCandidates;
  useCertificateRequests: (
    params: TListCertificateRequestsParams
  ) => V4QueryResult<TListCertificateRequestsResponse>;
  useApplicationSyncs: (projectId: string, applicationId: string) => V4QueryResult<TPkiSync[]>;
  useApplicationPolicies: (applicationId: string) => V4QueryResult<TApprovalPolicy[]>;
  useApplicationAlerts: (dto: TListAlertsDTO) => V4QueryResult<TAlert[]>;
  useLegacyAlerts: (applicationId: string) => V4QueryResult<TPkiAlertV2[]>;
  useCreateApplication: V4Mutation<TCreatePkiApplicationDTO, TPkiApplication>;
  useUpdateApplication: V4Mutation<TUpdatePkiApplicationDTO, TPkiApplication>;
  useDeleteApplication: V4Mutation<TDeletePkiApplicationDTO, unknown>;
  useAttachProfiles: V4Mutation<TAttachPkiApplicationProfilesDTO, unknown>;
  useDetachProfile: V4Mutation<TDetachPkiApplicationProfileDTO, unknown>;
  useAddMember: V4Mutation<TAddPkiApplicationMemberDTO, TPkiApplicationMember>;
  useAddUserMembers: V4Mutation<
    TAddPkiApplicationUserMembersDTO,
    TAddPkiApplicationUserMembersResponse
  >;
  useUpdateMemberRole: V4Mutation<TUpdatePkiApplicationMemberRoleDTO, TPkiApplicationMember>;
  useRemoveMember: V4Mutation<TRemovePkiApplicationMemberDTO, unknown>;
  useCancelCertificateRequest: V4Mutation<{ requestId: string }, TCancelCertificateRequestResponse>;
  useTriggerRequestValidation: V4Mutation<
    { requestId: string },
    TTriggerCertificateRequestValidationResponse
  >;
  useTriggerSync: V4Mutation<TTriggerPkiSyncSyncCertificatesDTO, unknown>;
  useCreatePolicy: V4Mutation<TCreateApprovalPolicyDTO, TApprovalPolicy>;
  useUpdatePolicy: V4Mutation<TUpdateApprovalPolicyDTO, TApprovalPolicy>;
  useDeletePolicy: V4Mutation<TDeleteApprovalPolicyDTO, string>;
  useUpdateAlert: V4Mutation<TUpdateAlertDTO, TAlert>;
  useDeleteAlert: V4Mutation<{ alertId: string }, unknown>;
  useDeleteLegacyAlert: V4Mutation<{ alertId: string; applicationId: string }, unknown>;
};
