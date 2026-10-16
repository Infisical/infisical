import { TDelegatedApprovalRequests } from "@app/db/schemas";
import { TDelegatedApprovalRequestDALFactory } from "@app/services/delegated-approval/delegated-approval-request-dal";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";

export type TDelegatedApprovalCallbackServiceFactoryDep = {
  delegatedApprovalRequestDAL: Pick<TDelegatedApprovalRequestDALFactory, "findById" | "primaryNode" | "update">;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
};

export type TGetOrIssueCallbackTokenDTO = {
  delegatedRequest: Pick<TDelegatedApprovalRequests, "id" | "encryptedCallbackToken">;
  orgId: string;
};
