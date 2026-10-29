import { TKmsKey } from "../model/kms-key";
import { TKmsKeyRepository } from "../repository/kms-key-repository";
import { TKmsCoreRepositories, TKmsCoreUnitOfWork } from "../repository/unit-of-work";

export const createInMemoryKmsKeyRepository = () => {
  const rows = new Map<string, TKmsKey>();

  const repository: TKmsKeyRepository = {
    findByOrgAndName: async (orgId, name) => [...rows.values()].find((row) => row.orgId === orgId && row.name === name),
    create: async (kmsKey) => {
      rows.set(kmsKey.id, kmsKey);
    },
    lockOrgKeyCreation: async () => {}
  };

  return { rows, repository };
};

export const createInMemoryKmsCoreUnitOfWork = (repositories: TKmsCoreRepositories): TKmsCoreUnitOfWork => ({
  run: (work) => work(repositories)
});
