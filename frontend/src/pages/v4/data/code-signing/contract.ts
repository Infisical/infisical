import type { MongoAbility } from "@casl/ability";

import type {
  SignerPermissionActions,
  SignerPermissionSub
} from "@app/context/SignerPermissionContext/types";
import type { TDigiCertOrder } from "@app/hooks/api/appConnections/digicert/queries";
import type { THsmConnectorKey } from "@app/hooks/api/hsmConnectors/types";
import type {
  TAddSignerGroupMemberDTO,
  TAddSignerIdentityMemberDTO,
  TAddSignerUserMembersDTO,
  TCheckSignerCertificateImportDTO,
  TCreateSignerDTO,
  TDeleteSignerDTO,
  TDisableSignerDTO,
  TEnableSignerDTO,
  TImportSignerCertificateDTO,
  TListEffectiveSignerMembersDTO,
  TListEffectiveSignerMembersResponse,
  TListSignerMembersDTO,
  TListSignerMembersResponse,
  TListSignerRequestsDTO,
  TListSignerRequestsResponse,
  TListSignersDTO,
  TListSignersResponse,
  TListSigningOperationsDTO,
  TListSigningOperationsResponse,
  TPreApproveSigningDTO,
  TReissueSignerCertificateDTO,
  TRemoveSignerGroupDTO,
  TRemoveSignerIdentityDTO,
  TRemoveSignerUserDTO,
  TRequestToSignDTO,
  TRevokeSignerRequestDTO,
  TSigner,
  TSignerMember,
  TSignerPolicy,
  TSigningOperationDetail,
  TUpdateSignerDTO,
  TUpdateSignerGroupRoleDTO,
  TUpdateSignerIdentityRoleDTO,
  TUpdateSignerPolicyDTO,
  TUpdateSignerUserRoleDTO
} from "@app/hooks/api/signers/types";
import type { SubscriptionPlan } from "@app/hooks/api/subscriptions/types";

import type { V4Mutation, V4QueryResult } from "../contract";

export type SignerPermission = {
  permission: MongoAbility<[SignerPermissionActions, SignerPermissionSub.Signer]>;
};

export type SignerMemberCandidate = { value: string; label: string };

export type SignerMemberCandidates = {
  users: V4QueryResult<SignerMemberCandidate[]>;
  identities: V4QueryResult<SignerMemberCandidate[]>;
  groups: V4QueryResult<SignerMemberCandidate[]>;
};

export type TSignerCertificateExport = {
  certificatePem: string;
  serialNumber: string;
  signerName: string;
};

export type TDigiCertOrdersDTO = {
  appConnectionId: string;
  organizationId: number;
  productNameId: string;
};

/** Every mutation here announces its own success, as main's hooks do. */
export type CodeSigningAdapter = {
  useSubscription: (orgId: string) => V4QueryResult<SubscriptionPlan>;
  useSigners: (dto: TListSignersDTO) => V4QueryResult<TListSignersResponse>;
  useSigner: (signerId: string) => V4QueryResult<TSigner>;
  useSignerPermission: (signerId: string) => V4QueryResult<SignerPermission>;
  useSigningOperations: (
    dto: TListSigningOperationsDTO
  ) => V4QueryResult<TListSigningOperationsResponse>;
  useSigningOperation: (
    signerId: string,
    operationId: string
  ) => V4QueryResult<TSigningOperationDetail>;
  useSignerMembers: (dto: TListSignerMembersDTO) => V4QueryResult<TListSignerMembersResponse>;
  useEffectiveSignerMembers: (
    dto: TListEffectiveSignerMembersDTO
  ) => V4QueryResult<TListEffectiveSignerMembersResponse>;
  useSignerPolicy: (signerId: string) => V4QueryResult<TSignerPolicy>;
  useSignerRequests: (dto: TListSignerRequestsDTO) => V4QueryResult<TListSignerRequestsResponse>;
  useSignerCertificate: (
    signerId: string,
    enabled: boolean
  ) => V4QueryResult<TSignerCertificateExport>;
  useMemberCandidates: (
    orgId: string,
    projectId: string,
    enabled: boolean
  ) => SignerMemberCandidates;
  useHsmConnectorKeys: (
    connectorId: string | null | undefined,
    label: string,
    enabled: boolean
  ) => V4QueryResult<THsmConnectorKey[]> & { isFetching: boolean };
  useDigiCertOrders: (dto: TDigiCertOrdersDTO) => V4QueryResult<TDigiCertOrder[]>;
  useCreateSigner: V4Mutation<TCreateSignerDTO, TSigner>;
  useUpdateSigner: V4Mutation<TUpdateSignerDTO, TSigner>;
  useDeleteSigner: V4Mutation<TDeleteSignerDTO & { projectId: string }, TSigner>;
  useEnableSigner: V4Mutation<TEnableSignerDTO, TSigner>;
  useDisableSigner: V4Mutation<TDisableSignerDTO, TSigner>;
  useReissueSignerCertificate: V4Mutation<TReissueSignerCertificateDTO, TSigner>;
  useImportSignerCertificate: V4Mutation<TImportSignerCertificateDTO, TSigner>;
  useCheckSignerCertificateImport: V4Mutation<TCheckSignerCertificateImportDTO, unknown>;
  useCheckSignerIssuance: V4Mutation<string, TSigner>;
  useAddUserMembers: V4Mutation<TAddSignerUserMembersDTO, unknown>;
  useAddIdentityMember: V4Mutation<TAddSignerIdentityMemberDTO, TSignerMember>;
  useAddGroupMember: V4Mutation<TAddSignerGroupMemberDTO, TSignerMember>;
  useUpdateUserRole: V4Mutation<TUpdateSignerUserRoleDTO, unknown>;
  useUpdateIdentityRole: V4Mutation<TUpdateSignerIdentityRoleDTO, unknown>;
  useUpdateGroupRole: V4Mutation<TUpdateSignerGroupRoleDTO, unknown>;
  useRemoveUserMember: V4Mutation<TRemoveSignerUserDTO, unknown>;
  useRemoveIdentityMember: V4Mutation<TRemoveSignerIdentityDTO, unknown>;
  useRemoveGroupMember: V4Mutation<TRemoveSignerGroupDTO, unknown>;
  useUpdateSignerPolicy: V4Mutation<TUpdateSignerPolicyDTO, TSignerPolicy>;
  useRequestToSign: V4Mutation<TRequestToSignDTO, unknown>;
  usePreApproveSigning: V4Mutation<TPreApproveSigningDTO, unknown>;
  useRevokeSignerRequest: V4Mutation<TRevokeSignerRequestDTO, unknown>;
};
