import { TDbClient } from "@app/db";

import { KmsKeyRepository, TKmsKeyRepository } from "./kms-key-repository";

export type TKmsCoreRepositories = {
  kmsKeys: TKmsKeyRepository;
};

export interface TKmsCoreUnitOfWork {
  run<T>(work: (repositories: TKmsCoreRepositories) => Promise<T>): Promise<T>;
}

export class KmsCoreUnitOfWork implements TKmsCoreUnitOfWork {
  constructor(private readonly db: TDbClient) {}

  run<T>(work: (repositories: TKmsCoreRepositories) => Promise<T>) {
    return this.db.transaction((trx) => work({ kmsKeys: new KmsKeyRepository(trx) }));
  }
}
