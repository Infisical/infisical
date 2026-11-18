import type { Knex } from "knex";

import { sealKnexTransaction } from "@app/domains/lib/transactions";
import { ReadFrom, TKmsDataKeyService, TEncryptWithKmsDataKeyDTO } from "@app/domains/platform/kms-core/ce/module";

// Legacy `tx?: Knex` is sometimes a plain primary connection, not a transaction. Only a transaction can be joined.
// A plain handle means "read what just committed", so it reads the primary.
export const dataKeysOn = (kmsDataKeyService: TKmsDataKeyService, tx?: Knex) => ({
  createCipherPairWithDataKey: (context: TEncryptWithKmsDataKeyDTO) => {
    if (tx?.isTransaction)
      return kmsDataKeyService.within(sealKnexTransaction(tx)).createCipherPairWithDataKey(context);
    return kmsDataKeyService.createCipherPairWithDataKey(context, tx ? { readFrom: ReadFrom.Primary } : undefined);
  }
});
