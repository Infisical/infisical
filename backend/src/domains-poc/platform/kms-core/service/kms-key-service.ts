import { TKmsKeyDataAccess } from "../data-access/kms-key-data-access";
import { KmsKey } from "../model/kms-key";
import { getOrgKeyOrThrow } from "./org-key";

export interface TKmsKeyService {
  getOrgKey(orgId: string): Promise<KmsKey>;
}

export class KmsKeyService implements TKmsKeyService {
  constructor(private readonly deps: { kmsKeyDataAccess: TKmsKeyDataAccess }) {}

  getOrgKey(orgId: string) {
    return getOrgKeyOrThrow(this.deps.kmsKeyDataAccess, orgId);
  }
}
