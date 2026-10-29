import { TKmsKey } from "../model/kms-key";
import { TKmsKeyRepository } from "../repository/kms-key-repository";
import { getOrgKeyOrThrow } from "./org-key";

export type TKmsKeyService = {
  getOrgKey: (orgId: string) => Promise<TKmsKey>;
};

export const createKmsKeyService = ({ kmsKeyRepository }: { kmsKeyRepository: TKmsKeyRepository }): TKmsKeyService => {
  const getOrgKey = (orgId: string) => getOrgKeyOrThrow(kmsKeyRepository, orgId);

  return { getOrgKey };
};
