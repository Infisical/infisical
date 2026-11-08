import { TReadOptions } from "@app/domains/lib/data-access-db";
import { HmacAlgorithm, hmacService } from "@app/lib/crypto/hmac";
import { AsymmetricKeyAlgorithm, signingService } from "@app/lib/crypto/sign";

import { TKmsCoreDataAccess } from "../data-access/kms-core-data-access";
import { KmsKey, KmsKeyUsage } from "../model/kms-key";
import { keyDecryptor, keyEncryptor, requireKey, TKmsCoreState, unwrapWithRootKey } from "./key-material";
import { TAsyncDecryptor, TAsyncEncryptor, TSignWithKmsDTO, TVerifyWithKmsDTO } from "./kms-core-types";

export type TKmsCryptoServiceDeps = {
  dataAccess: TKmsCoreDataAccess;
  state: TKmsCoreState;
};

// Encrypt, decrypt, sign and MAC with a KMS key. Reads only; the provider call of an external key runs when the
// returned function is called, never inside a transaction.
export class KmsCryptoService {
  constructor(private readonly deps: TKmsCryptoServiceDeps) {}

  async encryptWithKmsKey({ kmsId }: { kmsId: string }): Promise<TAsyncEncryptor> {
    const key = await requireKey(this.deps.dataAccess, kmsId);
    return keyEncryptor(this.deps.state, this.deps.dataAccess, key);
  }

  async decryptWithKmsKey({ kmsId }: { kmsId: string }): Promise<TAsyncDecryptor> {
    const key = await requireKey(this.deps.dataAccess, kmsId);
    return keyDecryptor(this.deps.state, this.deps.dataAccess, key);
  }

  async getPublicKey({ kmsId }: { kmsId: string }, options?: TReadOptions) {
    const key = await requireKey(this.deps.dataAccess, kmsId, options);
    const { encryptionAlgorithm } = key.materialFor(KmsKeyUsage.SIGN_VERIFY);
    return signingService(encryptionAlgorithm as AsymmetricKeyAlgorithm).getPublicKeyFromPrivateKey(this.material(key));
  }

  async signWithKmsKey({ kmsId }: Pick<TSignWithKmsDTO, "kmsId">, options?: TReadOptions) {
    const key = await requireKey(this.deps.dataAccess, kmsId, options);
    const algorithm = key.materialFor(KmsKeyUsage.SIGN_VERIFY).encryptionAlgorithm as AsymmetricKeyAlgorithm;
    const { sign } = signingService(algorithm);
    return async ({
      data,
      signingAlgorithm,
      isDigest
    }: Pick<TSignWithKmsDTO, "data" | "signingAlgorithm" | "isDigest">) => {
      const signature = await sign(data, this.material(key), signingAlgorithm, isDigest);
      return { signature, algorithm: signingAlgorithm };
    };
  }

  async verifyWithKmsKey({ kmsId, signingAlgorithm }: Pick<TVerifyWithKmsDTO, "kmsId" | "signingAlgorithm">) {
    const key = await requireKey(this.deps.dataAccess, kmsId);
    const algorithm = key.materialFor(KmsKeyUsage.SIGN_VERIFY).encryptionAlgorithm as AsymmetricKeyAlgorithm;
    const { verify, getPublicKeyFromPrivateKey } = signingService(algorithm);
    return async ({ data, signature, isDigest }: Pick<TVerifyWithKmsDTO, "data" | "signature" | "isDigest">) => {
      const publicKey = await getPublicKeyFromPrivateKey(this.material(key));
      const signatureValid = await verify(data, signature, publicKey, signingAlgorithm, isDigest);
      return { signatureValid, algorithm: signingAlgorithm };
    };
  }

  async generateMac({ kmsId }: { kmsId: string }) {
    const key = await requireKey(this.deps.dataAccess, kmsId);
    const macAlgorithm = key.materialFor(KmsKeyUsage.GENERATE_VERIFY_MAC).encryptionAlgorithm as HmacAlgorithm;
    const { generateMac } = hmacService(macAlgorithm);
    return ({ data }: { data: Buffer }) => ({ mac: generateMac(data, this.material(key)), algorithm: macAlgorithm });
  }

  async verifyMac({ kmsId }: { kmsId: string }) {
    const key = await requireKey(this.deps.dataAccess, kmsId);
    const macAlgorithm = key.materialFor(KmsKeyUsage.GENERATE_VERIFY_MAC).encryptionAlgorithm as HmacAlgorithm;
    const { verifyMac } = hmacService(macAlgorithm);
    return ({ data, mac }: { data: Buffer; mac: Buffer }) => ({
      macValid: verifyMac(data, mac, this.material(key)),
      algorithm: macAlgorithm
    });
  }

  // Unwrapped at use, so the material is not held for the life of the returned function.
  private material(key: KmsKey) {
    return unwrapWithRootKey(this.deps.state, key.internal?.encryptedKey as Buffer);
  }
}
