import { KmsKey } from "../model/kms-key";
import { TKmsKeyRepository } from "../repository/kms-key-repository";
import { getOrgKeyOrThrow } from "./org-key";

export interface TKmsKeyService {
  getOrgKey(orgId: string): Promise<KmsKey>;
}

export class KmsKeyService implements TKmsKeyService {
  constructor(private readonly deps: { kmsKeyRepository: TKmsKeyRepository }) {}

  getOrgKey(orgId: string) {
    return getOrgKeyOrThrow(this.deps.kmsKeyRepository, orgId);
  }
}
