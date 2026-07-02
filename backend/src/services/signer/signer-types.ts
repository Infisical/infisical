import { SigningAlgorithm } from "@app/lib/crypto/sign/types";
import { TProjectPermission } from "@app/lib/types";

import { CertKeyAlgorithm } from "../certificate/certificate-types";
import { CaType } from "../certificate-authority/certificate-authority-enums";
import { CertKeySource, SignerStatus, SigningOperationStatus } from "./signer-enums";

type TActorPermission = Omit<TProjectPermission, "projectId">;

export type TCreateSignerMemberInput = {
  kind: "user" | "identity" | "group";
  id: string;
  role: string;
};

export type TCreateSignerApprovalPolicyInput = {
  steps: TSignerPolicyStepInput[];
  constraints?: TSignerPolicyConstraints;
};

export type TSignerCertificateInput = {
  keySource?: CertKeySource;
  hsmConnectorId?: string;
};

export type TSignerExternalConfigurationInput = {
  caType: CaType.DIGICERT;
  reissueFromExternalOrderId?: string;
};

export type TCreateSignerDTO = {
  name: string;
  description?: string;
  caId?: string;
  commonName?: string;
  certificateTtlDays?: number;
  certificateRenewBeforeDays?: number | null;
  keyAlgorithm?: CertKeyAlgorithm;
  certificateId?: string;
  approvalPolicyId?: string;
  members?: TCreateSignerMemberInput[];
  approvalPolicy?: TCreateSignerApprovalPolicyInput;
  certificate?: TSignerCertificateInput;
  externalConfiguration?: TSignerExternalConfigurationInput;
} & TProjectPermission;

export type TUpdateSignerDTO = {
  signerId: string;
  name?: string;
  description?: string | null;
  certificateRenewBeforeDays?: number | null;
} & TActorPermission;

export type TDeleteSignerDTO = {
  signerId: string;
} & TActorPermission;

export type TGetSignerDTO = {
  signerId: string;
} & TActorPermission;

export type TListSignersDTO = {
  offset?: number;
  limit?: number;
  search?: string;
} & TProjectPermission;

export type TSignDataDTO = {
  signerId: string;
  data: string;
  signingAlgorithm: SigningAlgorithm;
  isDigest: boolean;
  actorName?: string;
  clientMetadata?: {
    tool?: string;
    hostname?: string;
    reportedIp?: string;
  };
} & TActorPermission;

export type TGetPublicKeyDTO = {
  signerId: string;
} & TActorPermission;

export type TListSigningOperationsDTO = {
  signerId: string;
  offset?: number;
  limit?: number;
  status?: SigningOperationStatus;
} & TActorPermission;

export type TEnableSignerDTO = {
  signerId: string;
} & TActorPermission;

export type TDisableSignerDTO = {
  signerId: string;
} & TActorPermission;

export type TReissueCertificateDTO = {
  signerId: string;
  caId: string;
  commonName?: string;
  certificateTtlDays?: number;
  keyAlgorithm?: CertKeyAlgorithm;
  certificate?: TSignerCertificateInput;
  externalConfiguration?: TSignerExternalConfigurationInput;
} & TActorPermission;

export type TExportCertificateDTO = {
  signerId: string;
} & TActorPermission;

export type TSignerPolicyStepInput = {
  stepNumber: number;
  name?: string | null;
  requiredApprovals: number;
  approverUserIds: string[];
  approverGroupIds?: string[];
};

export type TSignerPolicyConstraints = {
  maxSignings?: number | null;
  maxWindowDuration?: string | null;
};

export type TGetSignerPolicyDTO = {
  signerId: string;
} & TActorPermission;

export type TUpdateSignerPolicyDTO = {
  signerId: string;
  steps: TSignerPolicyStepInput[];
  constraints?: TSignerPolicyConstraints;
} & TActorPermission;

export type TSignerRequestStatusFilter = "pending" | "approved" | "expired" | "revoked";

export type TListSignerRequestsDTO = {
  signerId: string;
  statuses?: TSignerRequestStatusFilter[];
  offset?: number;
  limit?: number;
} & TActorPermission;

export type TRequestToSignDTO = {
  signerId: string;
  justification: string;
  requestedSignings?: number;
  requestedWindowStart?: string;
  requestedWindowEnd?: string;
} & TActorPermission;

export type TPreApproveSigningDTO = {
  signerId: string;
  granteeUserId?: string;
  granteeIdentityId?: string;
  justification: string;
  requestedSignings?: number;
  requestedWindowStart?: string;
  requestedWindowEnd?: string;
} & TActorPermission;

export type TRevokeSignerRequestDTO = {
  signerId: string;
  requestId: string;
} & TActorPermission;

export type { SignerStatus };
