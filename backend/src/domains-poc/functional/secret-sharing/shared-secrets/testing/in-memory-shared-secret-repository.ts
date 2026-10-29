import { TSharedSecret } from "../model/shared-secret";
import { TSharedSecretRepository } from "../repository/shared-secret-repository";
import { TSecretSharingRepositories, TSecretSharingUnitOfWork } from "../repository/unit-of-work";

export const createInMemorySharedSecretRepository = () => {
  const rows = new Map<string, TSharedSecret>();

  const repository: TSharedSecretRepository = {
    findById: async (sharedSecretId) => rows.get(sharedSecretId),
    findByIdForUpdate: async (sharedSecretId) => rows.get(sharedSecretId),
    create: async (sharedSecret) => {
      rows.set(sharedSecret.id, sharedSecret);
    },
    update: async (sharedSecret) => {
      rows.set(sharedSecret.id, sharedSecret);
    },
    delete: async (sharedSecretId) => {
      rows.delete(sharedSecretId);
    }
  };

  return { rows, repository };
};

export const createInMemorySecretSharingUnitOfWork = (
  repositories: TSecretSharingRepositories
): TSecretSharingUnitOfWork => ({
  run: (work) => work(repositories)
});
