import { Knex } from "knex";

import { KmsDataKey, TKmsDataKeyService } from "@app/domains/platform/kms-core/ce/module";
import { dataKeysOn } from "@app/lib/knex/kms-core-tx";

import { buildSecretBlindIndexer } from "./secret-blind-index-fns";
import { TSecretWriteCiphers } from "./secret-v2-bridge-types";

// The ciphers a secret write needs, fetched once per request rather than once per secret, since each resolution
// can be a round trip to an external KMS. Without a transaction the project and org ciphers are fetched in
// parallel. On the caller's transaction they are fetched one after the other, so the locks a first use takes are
// acquired in a fixed order.
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
