import { Knex } from "knex";

import { KmsDataKey, TKmsDataKeyService } from "@app/domains/platform/kms-core/ce/module";
import { dataKeysOn } from "@app/lib/knex/kms-core-tx";

import { buildSecretBlindIndexer } from "./secret-blind-index-fns";
import { TSecretWriteCiphers } from "./secret-v2-bridge-types";

// Fetched once per request, not per secret, since each resolution can hit an external KMS. Without a transaction
// the project and org ciphers load in parallel. On the caller's transaction they load one after the other, so
// first-use locks are always taken in the same order.
export const prepareSecretWriteCiphers = async ({
  kmsDataKeyService,
  projectId,
  orgId,
  tx
}: {
  kmsDataKeyService: TKmsDataKeyService;
  projectId: string;
  orgId: string;
  tx?: Knex;
}): Promise<TSecretWriteCiphers> => {
  const dataKeys = dataKeysOn(kmsDataKeyService, tx);
  const fetchOrgCipher = () => dataKeys.createCipherPairWithDataKey({ type: KmsDataKey.Organization, orgId });
  const fetchProjectCipher = () => dataKeys.createCipherPairWithDataKey({ type: KmsDataKey.SecretManager, projectId });

  if (tx?.isTransaction) {
    const orgCipher = await fetchOrgCipher();
    const secretManager = await fetchProjectCipher();
    return { secretManager, blindIndexer: buildSecretBlindIndexer(secretManager, orgCipher) };
  }

  const [secretManager, orgCipher] = await Promise.all([fetchProjectCipher(), fetchOrgCipher()]);
  return { secretManager, blindIndexer: buildSecretBlindIndexer(secretManager, orgCipher) };
};
