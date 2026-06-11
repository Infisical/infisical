import { TImmutableDBKeys, TSecretApprovalPolicies, TSecretApprovalRequestsSecrets } from "@app/db/schemas";
import { TProjectPermission } from "@app/lib/types";
import { ResourceMetadataWithEncryptionDTO } from "@app/services/resource-metadata/resource-metadata-schema";
import { SecretOperations } from "@app/services/secret/secret-types";

export enum RequestState {
  Open = "open",
  Closed = "close"
}

export enum ApprovalStatus {
  PENDING = "pending",
  APPROVED = "approved",
  REJECTED = "rejected"
}

export type TApprovalCreateSecret = Omit<
  TSecretApprovalRequestsSecrets,
  TImmutableDBKeys | "version" | "algorithm" | "keyEncoding" | "requestId" | "op" | "secretVersion" | "secretBlindIndex"
> & {
  secretName: string;
  tagIds?: string[];
};
export type TApprovalUpdateSecret = Partial<TApprovalCreateSecret> & {
  secretName: string;
  newSecretName?: string;
  tagIds?: string[];
};

export type TProxyConfigProposal = {
  placeholder?: string;
  rules: {
    host: string;
    authType: string;
    headerName?: string;
    prefix?: string;
    usernameKey?: string;
    headerTemplate?: string;
    substitutions?: { key: string; placeholder: string; in?: string[] }[];
  }[];
};

export type TApprovalCreateSecretV2Bridge = {
  secretKey: string;
  secretValue?: string;
  secretComment?: string;
  reminderNote?: string | null;
  reminderRepeatDays?: number | null;
  secretReminderRecipients?: string[] | null;
  skipMultilineEncoding?: boolean | null;
  metadata?: Record<string, string>;
  secretMetadata?: ResourceMetadataWithEncryptionDTO;
  tagIds?: string[];
  proxyConfig?: TProxyConfigProposal;
};

export type TApprovalUpdateSecretV2Bridge = Partial<TApprovalCreateSecretV2Bridge> & {
  secretKey: string;
  newSecretName?: string;
  tagIds?: string[];
};

export type TGenerateSecretApprovalRequestDTO = {
  environment: string;
  secretPath: string;
  policy: TSecretApprovalPolicies;
  data: {
    [SecretOperations.Create]?: TApprovalCreateSecret[];
    [SecretOperations.Update]?: TApprovalUpdateSecret[];
    [SecretOperations.Delete]?: { secretName: string }[];
  };
} & TProjectPermission;

export type TGenerateSecretApprovalRequestV2BridgeDTO = {
  environment: string;
  secretPath: string;
  policy: TSecretApprovalPolicies;
  data: {
    [SecretOperations.Create]?: TApprovalCreateSecretV2Bridge[];
    [SecretOperations.Update]?: TApprovalUpdateSecretV2Bridge[];
    [SecretOperations.Delete]?: { secretKey: string }[];
  };
} & TProjectPermission;

export type TMergeSecretApprovalRequestDTO = {
  approvalId: string;
  bypassReason?: string;
  valueOverrides?: { secretKey: string; secretValue: string }[];
} & Omit<TProjectPermission, "projectId">;

export type TStatusChangeDTO = {
  approvalId: string;
  status: RequestState;
} & Omit<TProjectPermission, "projectId">;

export type TReviewRequestDTO = {
  approvalId: string;
  status: ApprovalStatus;
  comment?: string;
} & Omit<TProjectPermission, "projectId">;

export type TApprovalRequestCountDTO = TProjectPermission & { policyId?: string };

export type TListApprovalsDTO = {
  projectId: string;
  status?: RequestState;
  environment?: string;
  committer?: string;
  limit?: number;
  offset?: number;
  search?: string;
} & TProjectPermission;

export type TSecretApprovalDetailsDTO = {
  id: string;
} & Omit<TProjectPermission, "projectId">;

export enum InternalMetadataType {
  MoveSecret = "move-secret",
  ProxyConfig = "proxy-config"
}

export type TInternalMetadataMoveSecret = {
  type: InternalMetadataType.MoveSecret;
  payload: {
    source: {
      environment: string;
      secretPath: string;
    };
  };
};

export type TInternalMetadataProxyConfig = {
  type: InternalMetadataType.ProxyConfig;
  payload: TProxyConfigProposal;
};

export type TInternalMetadata = TInternalMetadataMoveSecret | TInternalMetadataProxyConfig;
