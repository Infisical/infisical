import { TDelegatedApprovalRequests } from "@app/db/schemas";
import { TApprovalRequestDALFactory } from "@app/services/approval-policy/approval-request-dal";
import { TDelegatedApprovalRequestDALFactory } from "@app/services/delegated-approval/delegated-approval-request-dal";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";

export type TDelegatedApprovalCallbackServiceFactoryDep = {
  delegatedApprovalRequestDAL: Pick<TDelegatedApprovalRequestDALFactory, "findById" | "primaryNode" | "update">;
  approvalRequestDAL: Pick<TApprovalRequestDALFactory, "findById">;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
};

export type TGetOrIssueCallbackTokenDTO = {
  delegatedRequest: Pick<TDelegatedApprovalRequests, "id" | "requestId" | "encryptedCallbackToken">;
};
