import { TImmutableDBKeys } from "@app/db/schemas/models";
import { TSecretApprovalPolicies } from "@app/db/schemas/secret-approval-policies";
import { TSecretApprovalRequestsSecrets } from "@app/db/schemas/secret-approval-requests-secrets";
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

export type TApprovalCreateSecretV2Bridge = {
  secretKey: string;
  secretValue?: string;
  secretComment?: string;
  reminderNote?: string | null;
  reminderRepeatDays?: number | null;
  secretReminderRecipients?: string[] | null;
  skipMultilineEncoding?: boolean;
  metadata?: Record<string, string>;
  secretMetadata?: ResourceMetadataWithEncryptionDTO;
  tagIds?: string[];
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
