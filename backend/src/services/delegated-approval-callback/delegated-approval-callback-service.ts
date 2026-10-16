import { getConfig } from "@app/lib/config/env";
import { KmsDataKey } from "@app/services/kms/kms-types";

import { DELEGATED_APPROVAL_CALLBACK_PATH } from "./delegated-approval-callback-constants";
import { generateDelegatedApprovalCallbackToken } from "./delegated-approval-callback-fns";
import {
  TDelegatedApprovalCallbackServiceFactoryDep,
  TGetOrIssueCallbackTokenDTO
} from "./delegated-approval-callback-types";

export type TDelegatedApprovalCallbackServiceFactory = ReturnType<typeof delegatedApprovalCallbackServiceFactory>;

export const delegatedApprovalCallbackServiceFactory = ({
  delegatedApprovalRequestDAL,
  kmsService
}: TDelegatedApprovalCallbackServiceFactoryDep) => {
  const getCallbackUrl = () => {
    const { SITE_URL } = getConfig();
    return SITE_URL ? `${SITE_URL}${DELEGATED_APPROVAL_CALLBACK_PATH}` : null;
  };

  const getOrIssueCallbackToken = async ({ delegatedRequest, orgId }: TGetOrIssueCallbackTokenDTO) => {
    const { encryptor, decryptor } = await kmsService.createCipherPairWithDataKey({
      type: KmsDataKey.Organization,
      orgId
    });

    if (delegatedRequest.encryptedCallbackToken) {
      return decryptor({ cipherTextBlob: delegatedRequest.encryptedCallbackToken }).toString();
    }

    const token = generateDelegatedApprovalCallbackToken();
    const [issued] = await delegatedApprovalRequestDAL.update(
      { id: delegatedRequest.id, encryptedCallbackToken: null },
      { encryptedCallbackToken: encryptor({ plainText: Buffer.from(token) }).cipherTextBlob }
    );
    if (issued) return token;

    const current = await delegatedApprovalRequestDAL.findById(
      delegatedRequest.id,
      delegatedApprovalRequestDAL.primaryNode()
    );
    if (!current?.encryptedCallbackToken) return null;

    return decryptor({ cipherTextBlob: current.encryptedCallbackToken }).toString();
  };

  return { getCallbackUrl, getOrIssueCallbackToken };
};
