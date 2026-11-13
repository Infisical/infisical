import { KmsDataKey, TDataKeyService, TReadOptions } from "@app/domains/platform/kms-core/ce/module";

import { buildSecretBlindIndexer } from "./secret-blind-index-fns";
import { TSecretWriteCiphers } from "./secret-v2-bridge-types";

// The ciphers a secret write needs, fetched once and before the caller opens the transaction the write runs in. A
// caller that has just created the project passes { readFrom: ReadFrom.Primary }.
export const prepareSecretWriteCiphers = async ({
  dataKeyService,
  projectId,
  orgId,
  readOptions
}: {
  dataKeyService: TDataKeyService;
  projectId: string;
  orgId: string;
  readOptions?: TReadOptions;
}): Promise<TSecretWriteCiphers> => {
  const [secretManager, orgCipher] = await Promise.all([
    dataKeyService.createCipherPairWithDataKey({ type: KmsDataKey.SecretManager, projectId }, readOptions),
    dataKeyService.createCipherPairWithDataKey({ type: KmsDataKey.Organization, orgId }, readOptions)
  ]);
  return { secretManager, blindIndexer: buildSecretBlindIndexer(secretManager, orgCipher) };
};
