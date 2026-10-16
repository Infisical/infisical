import { TDelegatedApprovalRequests } from "@app/db/schemas";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";

import { TDelegatedApprovalCallbackDALFactory } from "./delegated-approval-callback-dal";

export type TDelegatedApprovalCallbackServiceFactoryDep = {
  delegatedApprovalCallbackDAL: Pick<TDelegatedApprovalCallbackDALFactory, "findById" | "transaction" | "update">;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
};

export type TGetOrIssueCallbackTokenDTO = {
  delegatedRequest: Pick<TDelegatedApprovalRequests, "id" | "encryptedCallbackToken">;
  orgId: string;
};
