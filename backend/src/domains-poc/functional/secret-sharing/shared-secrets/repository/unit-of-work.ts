import { TDbClient } from "@app/db";

import { createSharedSecretRepository, TSharedSecretRepository } from "./shared-secret-repository";

export type TSecretSharingRepositories = {
  sharedSecrets: TSharedSecretRepository;
};

export type TSecretSharingUnitOfWork = {
  run: <T>(work: (repositories: TSecretSharingRepositories) => Promise<T>) => Promise<T>;
};

export const createSecretSharingUnitOfWork = (db: TDbClient): TSecretSharingUnitOfWork => ({
  run: (work) => db.transaction((trx) => work({ sharedSecrets: createSharedSecretRepository(trx) }))
});
