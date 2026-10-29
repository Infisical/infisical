import { TDbClient } from "@app/db";

import { createKmsKeyRepository, TKmsKeyRepository } from "./kms-key-repository";

export type TKmsCoreRepositories = {
  kmsKeys: TKmsKeyRepository;
};

export type TKmsCoreUnitOfWork = {
  run: <T>(work: (repositories: TKmsCoreRepositories) => Promise<T>) => Promise<T>;
};

export const createKmsCoreUnitOfWork = (db: TDbClient): TKmsCoreUnitOfWork => ({
  run: (work) => db.transaction((trx) => work({ kmsKeys: createKmsKeyRepository(trx) }))
});
