import { TDbClient } from "@app/db";

import { SharedSecretRepository, TSharedSecretRepository } from "./shared-secret-repository";

export type TSecretSharingRepositories = {
  sharedSecrets: TSharedSecretRepository;
};

export interface TSecretSharingUnitOfWork {
  run<T>(work: (repositories: TSecretSharingRepositories) => Promise<T>): Promise<T>;
}

export class SecretSharingUnitOfWork implements TSecretSharingUnitOfWork {
  constructor(private readonly db: TDbClient) {}

  run<T>(work: (repositories: TSecretSharingRepositories) => Promise<T>) {
    return this.db.transaction((trx) => work({ sharedSecrets: new SharedSecretRepository(trx) }));
  }
}
