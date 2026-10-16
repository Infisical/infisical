import { getConfig } from "@app/lib/config/env";
import { KmsDataKey } from "@app/services/kms/kms-types";

import {
  buildDelegatedApprovalCallbackUrl,
  generateDelegatedApprovalCallbackToken
} from "./delegated-approval-callback-fns";
import {
  TDelegatedApprovalCallbackServiceFactoryDep,
  TGetOrIssueCallbackTokenDTO
} from "./delegated-approval-callback-types";

export type TDelegatedApprovalCallbackServiceFactory = ReturnType<typeof delegatedApprovalCallbackServiceFactory>;

export const delegatedApprovalCallbackServiceFactory = ({
  delegatedApprovalCallbackDAL,
  kmsService
}: TDelegatedApprovalCallbackServiceFactoryDep) => {
  const getCallbackUrl = () => {
    const { SITE_URL } = getConfig();
    return SITE_URL ? buildDelegatedApprovalCallbackUrl(SITE_URL) : null;
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
    const [issued] = await delegatedApprovalCallbackDAL.update(
      { id: delegatedRequest.id, encryptedCallbackToken: null },
      { encryptedCallbackToken: encryptor({ plainText: Buffer.from(token) }).cipherTextBlob }
    );
    if (issued) return token;

    const current = await delegatedApprovalCallbackDAL.transaction((tx) =>
      delegatedApprovalCallbackDAL.findById(delegatedRequest.id, tx)
    );
    if (!current?.encryptedCallbackToken) return null;

    return decryptor({ cipherTextBlob: current.encryptedCallbackToken }).toString();
  };

  return { getCallbackUrl, getOrIssueCallbackToken };
};
