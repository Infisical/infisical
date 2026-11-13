import { Knex } from "knex";

import { sealKnexTransaction } from "@app/domains/lib/transactions";
import { KmsDataKey, TDataKeyService, TReadOptions } from "@app/domains/platform/kms-core/ce/module";

import { buildSecretBlindIndexer } from "./secret-blind-index-fns";
import { TSecretWriteCiphers } from "./secret-v2-bridge-types";

// The ciphers a secret write needs, fetched once. Without `tx` the project and org ciphers are fetched in parallel.
// With the caller's transaction they are fetched on it, one after the other, so the locks a first use takes are
// acquired in a fixed order. A caller that has just created the project passes { readFrom: ReadFrom.Primary }, which
// only applies outside a transaction.
export const prepareSecretWriteCiphers = async ({
  dataKeyService,
  projectId,
  orgId,
  readOptions,
  tx
}: {
  dataKeyService: TDataKeyService;
  projectId: string;
  orgId: string;
  readOptions?: TReadOptions;
  tx?: Knex;
}): Promise<TSecretWriteCiphers> => {
  if (tx) {
    const joined = dataKeyService.within(sealKnexTransaction(tx));
    const orgCipher = await joined.createCipherPairWithDataKey({ type: KmsDataKey.Organization, orgId });
    const secretManager = await joined.createCipherPairWithDataKey({ type: KmsDataKey.SecretManager, projectId });
    return { secretManager, blindIndexer: buildSecretBlindIndexer(secretManager, orgCipher) };
  }

  const [secretManager, orgCipher] = await Promise.all([
    dataKeyService.createCipherPairWithDataKey({ type: KmsDataKey.SecretManager, projectId }, readOptions),
    dataKeyService.createCipherPairWithDataKey({ type: KmsDataKey.Organization, orgId }, readOptions)
  ]);
  return { secretManager, blindIndexer: buildSecretBlindIndexer(secretManager, orgCipher) };
};
