import type { Knex } from "knex";

import { sealKnexTransaction } from "@app/domains/lib/transactions";
import { ReadFrom, TDataKeyService, TEncryptWithKmsDataKeyDTO } from "@app/domains/platform/kms-core/ce/module";

// Legacy code hands down `tx?: Knex`, which is sometimes a plain primary connection rather than a transaction.
// Only a transaction can be joined; a plain handle means "read what has just committed", so it reads the primary.
export const dataKeysOn = (kmsDataKeyService: TDataKeyService, tx?: Knex) => ({
  createCipherPairWithDataKey: (context: TEncryptWithKmsDataKeyDTO) => {
    if (tx?.isTransaction)
      return kmsDataKeyService.within(sealKnexTransaction(tx)).createCipherPairWithDataKey(context);
    return kmsDataKeyService.createCipherPairWithDataKey(context, tx ? { readFrom: ReadFrom.Primary } : undefined);
  }
});
