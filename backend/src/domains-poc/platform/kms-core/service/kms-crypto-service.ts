import { TTransactionRunner } from "@app/domains-poc/lib/transaction-runner";

import { TKmsCoreDataAccess } from "../data-access";
import { TKmsKeyDataAccess } from "../data-access/kms-key-data-access";
import { KmsKey } from "../model/kms-key";
import { getOrCreateOrgKey, getOrgKeyOrThrow, keyCipher, unwrapWithRootKey } from "./org-key";

export type TEncryptWithOrgKeyInput = {
  orgId: string;
  plaintext: Buffer;
};

export type TDecryptWithOrgKeyInput = {
  orgId: string;
  ciphertext: Buffer;
};

export type TKmsCoreHooks = {
  // Resolves to undefined when the key is not the hook's, so the root key unwraps it.
  unwrapOrgKey?: (kmsKey: KmsKey) => Promise<Buffer | undefined>;
};

export interface TKmsCryptoService {
  encryptWithOrgKey(input: TEncryptWithOrgKeyInput): Promise<Buffer>;
  decryptWithOrgKey(input: TDecryptWithOrgKeyInput): Promise<Buffer>;
}

export type TKmsCryptoServiceDependencies = {
  kmsKeyDataAccess: TKmsKeyDataAccess;
  transactionRunner: TTransactionRunner<TKmsCoreDataAccess>;
  rootKey: Buffer;
  hooks: TKmsCoreHooks;
};

export class KmsCryptoService implements TKmsCryptoService {
  constructor(private readonly deps: TKmsCryptoServiceDependencies) {}

  async encryptWithOrgKey({ orgId, plaintext }: TEncryptWithOrgKeyInput) {
    const kmsKey = await getOrCreateOrgKey(this.deps, orgId);
    kmsKey.assertCanEncrypt();
    return keyCipher.encrypt(plaintext, await this.unwrap(kmsKey));
  }

  async decryptWithOrgKey({ orgId, ciphertext }: TDecryptWithOrgKeyInput) {
    const kmsKey = await getOrgKeyOrThrow(this.deps.kmsKeyDataAccess, orgId);
    return keyCipher.decrypt(ciphertext, await this.unwrap(kmsKey));
  }

  private async unwrap(kmsKey: KmsKey) {
    return (await this.deps.hooks.unwrapOrgKey?.(kmsKey)) ?? unwrapWithRootKey(kmsKey, this.deps.rootKey);
  }
}
