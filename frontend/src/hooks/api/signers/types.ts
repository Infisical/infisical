export enum SignerStatus {
  Active = "active",
  Disabled = "disabled"
}

export const signerStatusLabels: Record<SignerStatus, string> = {
  [SignerStatus.Active]: "Active",
  [SignerStatus.Disabled]: "Disabled"
};

export const getSignerStatusBadgeVariant = (status: SignerStatus) => {
  switch (status) {
    case SignerStatus.Active:
      return "success" as const;
    case SignerStatus.Disabled:
      return "warning" as const;
    default:
      return "neutral" as const;
  }
};

export enum SigningOperationStatus {
  Success = "success",
  Failed = "failed",
  Denied = "denied"
}

export const signingOperationStatusLabels: Record<SigningOperationStatus, string> = {
  [SigningOperationStatus.Success]: "Success",
  [SigningOperationStatus.Failed]: "Failed",
  [SigningOperationStatus.Denied]: "Denied"
};

export type TSigner = {
  id: string;
  projectId: string;
  name: string;
  description?: string | null;
  status: SignerStatus;
  certificateId: string;
  approvalPolicyId: string;
  lastSignedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  certificateCommonName?: string | null;
  certificateSerialNumber?: string | null;
  certificateNotAfter?: string | null;
  approvalPolicyName?: string | null;
};

export enum SigningActorType {
  User = "user",
  Identity = "identity"
}

export type TSigningOperation = {
  id: string;
  signerId: string;
  projectId: string;
  status: SigningOperationStatus;
  signingAlgorithm: string;
  dataHash: string;
  actorType: SigningActorType;
  actorId: string;
  actorName?: string | null;
  actorMembershipId?: string | null;
  approvalGrantId?: string | null;
  clientMetadata?: {
    tool?: string;
    hostname?: string;
    reportedIp?: string;
  } | null;
  errorMessage?: string | null;
  createdAt: string;
};

export type TListSignersDTO = {
  projectId: string;
  offset?: number;
  limit?: number;
  search?: string;
};

export type TListSignersResponse = {
  signers: TSigner[];
  totalCount: number;
};

export type TCreateSignerDTO = {
  projectId: string;
  name: string;
  description?: string;
  certificateId: string;
  approvalPolicyId: string;
};

export type TUpdateSignerDTO = {
  signerId: string;
  name?: string;
  description?: string | null;
  status?: SignerStatus;
  certificateId?: string;
  approvalPolicyId?: string;
};

export type TDeleteSignerDTO = {
  signerId: string;
};

export type TGetPublicKeyResponse = {
  publicKey: string;
  algorithm: string;
};

export type TListSigningOperationsDTO = {
  signerId: string;
  offset?: number;
  limit?: number;
  status?: SigningOperationStatus;
};

export type TListSigningOperationsResponse = {
  operations: TSigningOperation[];
  totalCount: number;
};
