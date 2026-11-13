import { RuleViolationError } from "@app/domains/lib/errors";
import { symmetricCipherService, SymmetricKeyAlgorithm } from "@app/lib/crypto/cipher";
import { crypto } from "@app/lib/crypto/cryptography";
import { HmacAlgorithm, hmacService } from "@app/lib/crypto/hmac";
import { detectPqcVariantFromDer } from "@app/lib/crypto/pqc/pqc-crypto";
import {
  AsymmetricKeyAlgorithm,
  isPqcKeyAlgorithm,
  KMS_TO_OPENSSL_NAME,
  SigningAlgorithm,
  signingService
} from "@app/lib/crypto/sign";

import { RootKey } from "./root-key";

export enum KmsKeyUsage {
  ENCRYPT_DECRYPT = "encrypt-decrypt",
  SIGN_VERIFY = "sign-verify",
  GENERATE_VERIFY_MAC = "generate-verify-mac"
}

export type TKmsKeyAlgorithmName = SymmetricKeyAlgorithm | AsymmetricKeyAlgorithm | HmacAlgorithm;

export const MIN_HMAC_IMPORT_KEY_BYTE_LENGTH = 16;
export const MAX_HMAC_IMPORT_KEY_BYTE_LENGTH = 1024;

type TClassicalKeyShape = { keyType: string; modulusLength?: number; namedCurve?: string; label: string };

const CLASSICAL_KEY_SHAPES: Partial<Record<AsymmetricKeyAlgorithm, TClassicalKeyShape>> = {
  [AsymmetricKeyAlgorithm.RSA_4096]: { keyType: "rsa", modulusLength: 4096, label: "an RSA 4096-bit key" },
  [AsymmetricKeyAlgorithm.ECC_NIST_P256]: { keyType: "ec", namedCurve: "prime256v1", label: "an EC P-256 key" },
  [AsymmetricKeyAlgorithm.ECC_NIST_P384]: { keyType: "ec", namedCurve: "secp384r1", label: "an EC P-384 key" },
  [AsymmetricKeyAlgorithm.ECC_NIST_P521]: { keyType: "ec", namedCurve: "secp521r1", label: "an EC P-521 key" },
  [AsymmetricKeyAlgorithm.ED25519]: { keyType: "ed25519", label: "an Ed25519 key" }
};

const OPENSSL_TO_KMS: Record<string, string> = Object.fromEntries(
  Object.entries(KMS_TO_OPENSSL_NAME).map(([kms, openssl]) => [openssl, kms])
);

// The plaintext material of an internal KMS key. It exists only between unwrapping and use, so nothing holds it for
// the life of a request.
export class KeyMaterial {
  private constructor(
    private readonly bytes: Buffer,
    readonly usage: KmsKeyUsage,
    readonly algorithm: TKmsKeyAlgorithmName
  ) {}

  // Refuses an algorithm the key usage cannot use, and an unknown usage. `forceType` also refuses a key used for
  // something other than the operation the caller needs.
  static assertAlgorithmFits(usage: KmsKeyUsage, algorithm: TKmsKeyAlgorithmName, forceType?: KmsKeyUsage) {
    if (forceType && usage !== forceType) {
      throw new RuleViolationError({ message: `Unsupported key type, expected ${forceType} but got ${usage}` });
    }

    if (usage === KmsKeyUsage.ENCRYPT_DECRYPT) {
      if (!Object.values(SymmetricKeyAlgorithm).includes(algorithm as SymmetricKeyAlgorithm)) {
        throw new RuleViolationError({
          message: `Unsupported encryption algorithm for encrypt/decrypt key: ${algorithm as string}`
        });
      }
      return;
    }

    if (usage === KmsKeyUsage.SIGN_VERIFY) {
      if (!Object.values(AsymmetricKeyAlgorithm).includes(algorithm as AsymmetricKeyAlgorithm)) {
        throw new RuleViolationError({
          message: `Unsupported sign/verify algorithm for sign/verify key: ${algorithm as string}`
        });
      }
      return;
    }

    if (usage === KmsKeyUsage.GENERATE_VERIFY_MAC) {
      if (!Object.values(HmacAlgorithm).includes(algorithm as HmacAlgorithm)) {
        throw new RuleViolationError({
          message: `Unsupported HMAC algorithm for generate/verify MAC key: ${algorithm as string}`
        });
      }
      return;
    }

    throw new RuleViolationError({ message: `Unsupported key type: ${usage as string}` });
  }

  static symmetricKeyLength(algorithm: SymmetricKeyAlgorithm): number {
    switch (algorithm) {
      case SymmetricKeyAlgorithm.AES_GCM_128:
        return 16;
      case SymmetricKeyAlgorithm.AES_GCM_256:
      default:
        return 32;
    }
  }

  static generateSymmetric(algorithm: SymmetricKeyAlgorithm = SymmetricKeyAlgorithm.AES_GCM_256): KeyMaterial {
    return new KeyMaterial(
      crypto.randomBytes(KeyMaterial.symmetricKeyLength(algorithm)),
      KmsKeyUsage.ENCRYPT_DECRYPT,
      algorithm
    );
  }

  static async generate(
    usage: KmsKeyUsage = KmsKeyUsage.ENCRYPT_DECRYPT,
    algorithm: TKmsKeyAlgorithmName = SymmetricKeyAlgorithm.AES_GCM_256
  ): Promise<KeyMaterial> {
    KeyMaterial.assertAlgorithmFits(usage, algorithm);

    if (usage === KmsKeyUsage.ENCRYPT_DECRYPT) return KeyMaterial.generateSymmetric(algorithm as SymmetricKeyAlgorithm);

    if (usage === KmsKeyUsage.SIGN_VERIFY) {
      const { generateAsymmetricPrivateKey, getPublicKeyFromPrivateKey } = signingService(
        algorithm as AsymmetricKeyAlgorithm
      );
      const bytes = await generateAsymmetricPrivateKey();
      // A key whose public half cannot be derived is refused before it is stored.
      await getPublicKeyFromPrivateKey(bytes);
      return new KeyMaterial(bytes, usage, algorithm);
    }

    if (usage === KmsKeyUsage.GENERATE_VERIFY_MAC) {
      return new KeyMaterial(hmacService(algorithm as HmacAlgorithm).generateKeyMaterial(), usage, algorithm);
    }

    throw new RuleViolationError({
      message: `Invalid KMS key type. No key material was created for key usage '${usage as string}' using algorithm '${algorithm as string}'`
    });
  }

  // Refuses imported material that does not fit the declared usage and algorithm.
  static async import(bytes: Buffer, usage: KmsKeyUsage, algorithm: TKmsKeyAlgorithmName): Promise<KeyMaterial> {
    KeyMaterial.assertAlgorithmFits(usage, algorithm);

    if (usage === KmsKeyUsage.ENCRYPT_DECRYPT) {
      const expectedLength = KeyMaterial.symmetricKeyLength(algorithm as SymmetricKeyAlgorithm);
      if (bytes.length !== expectedLength) {
        throw new RuleViolationError({
          message: `Invalid key material length for ${algorithm as string}. Expected ${expectedLength} bytes, got ${bytes.length}.`
        });
      }
    }

    if (usage === KmsKeyUsage.SIGN_VERIFY) {
      const { getPublicKeyFromPrivateKey } = signingService(algorithm as AsymmetricKeyAlgorithm);
      try {
        await getPublicKeyFromPrivateKey(bytes);
      } catch {
        const expectedFormat = isPqcKeyAlgorithm(algorithm as string) ? "PKCS8 DER-encoded" : "PKCS8 PEM-encoded";
        throw new RuleViolationError({
          message: `Invalid private key material. Expected a ${expectedFormat} private key.`
        });
      }

      if (isPqcKeyAlgorithm(algorithm as string)) {
        const detectedVariant = detectPqcVariantFromDer(bytes);
        const expectedVariant = KMS_TO_OPENSSL_NAME[algorithm as AsymmetricKeyAlgorithm];
        if (detectedVariant && expectedVariant && detectedVariant !== expectedVariant) {
          throw new RuleViolationError({
            message: `Key material does not match the declared algorithm. Expected ${algorithm as string} but the key is ${OPENSSL_TO_KMS[detectedVariant] || detectedVariant}.`
          });
        }
      } else {
        KeyMaterial.assertClassicalShape(bytes, algorithm as AsymmetricKeyAlgorithm);
      }
    }

    if (usage === KmsKeyUsage.GENERATE_VERIFY_MAC) {
      if (bytes.length < MIN_HMAC_IMPORT_KEY_BYTE_LENGTH || bytes.length > MAX_HMAC_IMPORT_KEY_BYTE_LENGTH) {
        throw new RuleViolationError({
          message: `Invalid HMAC key material length. Expected between ${MIN_HMAC_IMPORT_KEY_BYTE_LENGTH} and ${MAX_HMAC_IMPORT_KEY_BYTE_LENGTH} bytes, got ${bytes.length}.`
        });
      }
    }

    return new KeyMaterial(bytes, usage, algorithm);
  }

  // Bytes a root key unwrapped from stored material.
  static restore(bytes: Buffer, usage: KmsKeyUsage, algorithm: TKmsKeyAlgorithmName): KeyMaterial {
    return new KeyMaterial(bytes, usage, algorithm);
  }

  private static assertClassicalShape(bytes: Buffer, algorithm: AsymmetricKeyAlgorithm) {
    const expected = CLASSICAL_KEY_SHAPES[algorithm];
    if (!expected) return;

    const keyObj = crypto.nativeCrypto.createPrivateKey({ key: bytes, format: "pem", type: "pkcs8" });
    const details = keyObj.asymmetricKeyDetails;
    const matches =
      keyObj.asymmetricKeyType === expected.keyType &&
      (expected.modulusLength === undefined || details?.modulusLength === expected.modulusLength) &&
      (expected.namedCurve === undefined || details?.namedCurve === expected.namedCurve);

    if (!matches) {
      throw new RuleViolationError({
        message: `Key material does not match the declared algorithm. Expected ${expected.label}.`
      });
    }
  }

  // What the root key stores in internal_kms.
  wrap(rootKey: RootKey): Buffer {
    return rootKey.encrypt(this.bytes);
  }

  // The raw bytes, for an export the key allows.
  exportBytes(): Buffer {
    return this.bytes;
  }

  encrypt(plainText: Buffer): Buffer<ArrayBuffer> {
    this.assertUsage(KmsKeyUsage.ENCRYPT_DECRYPT);
    return symmetricCipherService(this.algorithm as SymmetricKeyAlgorithm).encrypt(plainText, this.bytes);
  }

  decrypt(cipherText: Buffer): Buffer<ArrayBuffer> {
    this.assertUsage(KmsKeyUsage.ENCRYPT_DECRYPT);
    return symmetricCipherService(this.algorithm as SymmetricKeyAlgorithm).decrypt(cipherText, this.bytes);
  }

  publicKey(): Promise<Buffer> {
    this.assertUsage(KmsKeyUsage.SIGN_VERIFY);
    return signingService(this.algorithm as AsymmetricKeyAlgorithm).getPublicKeyFromPrivateKey(this.bytes);
  }

  sign(data: Buffer, signingAlgorithm: SigningAlgorithm, isDigest: boolean): Promise<Buffer> {
    this.assertUsage(KmsKeyUsage.SIGN_VERIFY);
    return signingService(this.algorithm as AsymmetricKeyAlgorithm).sign(data, this.bytes, signingAlgorithm, isDigest);
  }

  async verify(
    data: Buffer,
    signature: Buffer,
    signingAlgorithm: SigningAlgorithm,
    isDigest: boolean
  ): Promise<boolean> {
    this.assertUsage(KmsKeyUsage.SIGN_VERIFY);
    const { verify, getPublicKeyFromPrivateKey } = signingService(this.algorithm as AsymmetricKeyAlgorithm);
    const publicKey = await getPublicKeyFromPrivateKey(this.bytes);
    return verify(data, signature, publicKey, signingAlgorithm, isDigest);
  }

  generateMac(data: Buffer): Buffer {
    this.assertUsage(KmsKeyUsage.GENERATE_VERIFY_MAC);
    return hmacService(this.algorithm as HmacAlgorithm).generateMac(data, this.bytes);
  }

  verifyMac(data: Buffer, mac: Buffer): boolean {
    this.assertUsage(KmsKeyUsage.GENERATE_VERIFY_MAC);
    return hmacService(this.algorithm as HmacAlgorithm).verifyMac(data, mac, this.bytes);
  }

  private assertUsage(expected: KmsKeyUsage) {
    KeyMaterial.assertAlgorithmFits(this.usage, this.algorithm, expected);
  }
}
