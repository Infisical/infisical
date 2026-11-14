import { createHash } from "node:crypto";

import { RuleViolationError } from "@app/domains/lib/errors";
import { isBase64 } from "@app/lib/base64";
import { symmetricCipherService, SymmetricKeyAlgorithm } from "@app/lib/crypto/cipher";

import { RootKey } from "./root-key";

const KEK_LABEL_DOMAIN = "infisical:kek-fingerprint:v1";

const FIPS_KEY_HINT = "You can generate a 256-bit key using the following command: `openssl rand -base64 32`";

export type TInstanceEncryptionKeyEnv = {
  ENCRYPTION_KEY?: string;
  ROOT_ENCRYPTION_KEY?: string;
};

// The env key that wraps the root key under the software strategy (the KEK).
export class InstanceEncryptionKey {
  private constructor(private readonly buffer: Buffer) {}

  /**
   * The AES key an environment resolves to. Single-sourced: a rotation predicts exactly what a booting instance
   * will compute from the value it hands the operator, so a second copy of this rule would drift into a key that
   * does not boot.
   */
  static fromEnv(env: TInstanceEncryptionKeyEnv): InstanceEncryptionKey {
    const encryptionKey = env.ENCRYPTION_KEY || env.ROOT_ENCRYPTION_KEY;
    if (!encryptionKey) {
      throw new RuleViolationError({
        message: "Instance encryption key not found. Did you set the ENCRYPTION_KEY environment variable?"
      });
    }

    const isUtf8Key = Boolean(env.ENCRYPTION_KEY);
    const buffer = Buffer.from(encryptionKey, isUtf8Key ? "utf8" : "base64");
    if (buffer.length !== 32) {
      throw new RuleViolationError({
        message: `The configured encryption key resolves to ${buffer.length} bytes, but 32 are required. Generate one with '${
          isUtf8Key ? "openssl rand -hex 16" : "openssl rand -base64 32"
        }'.`
      });
    }

    return new InstanceEncryptionKey(buffer);
  }

  // The key a newly generated rotation value resolves to, under the same rule as a booting instance.
  static fromRotationValue(value: string, isFipsEnabled: boolean): InstanceEncryptionKey {
    return InstanceEncryptionKey.fromEnv(isFipsEnabled ? { ROOT_ENCRYPTION_KEY: value } : { ENCRYPTION_KEY: value });
  }

  // What a software-strategy boot needs before it reads anything: a key is set and, under FIPS, it is base64 for 256 bits.
  static assertConfigured(env: TInstanceEncryptionKeyEnv, isFipsEnabled: boolean): void {
    if (isFipsEnabled) {
      // Under FIPS the environment moves ENCRYPTION_KEY into ROOT_ENCRYPTION_KEY, so that is where it is checked.
      const key = env.ENCRYPTION_KEY ?? env.ROOT_ENCRYPTION_KEY;
      if (!key) {
        throw new RuleViolationError({
          message: `FIPS mode is enabled, but the ENCRYPTION_KEY environment variable is not set.\n${FIPS_KEY_HINT}`
        });
      }
      if (!isBase64(key)) {
        throw new RuleViolationError({
          message: `FIPS mode is enabled, but the ENCRYPTION_KEY environment variable is not a base64 encoded 256-bit key.\n${FIPS_KEY_HINT}`
        });
      }
      if (Buffer.from(key, "base64").length * 8 !== 256) {
        throw new RuleViolationError({
          message: `FIPS mode is enabled, but the ENCRYPTION_KEY environment variable is not a 256-bit key.\n${FIPS_KEY_HINT}`
        });
      }
    }
    if (!env.ROOT_ENCRYPTION_KEY && !env.ENCRYPTION_KEY) {
      throw new RuleViolationError({
        message:
          "Root KMS encryption strategy is set to software. Please set the ENCRYPTION_KEY environment variable and restart your deployment.\nYou can enable HSM encryption in the Server Console."
      });
    }
  }

  // The software strategy is only a valid switch target when this instance has a key to wrap with.
  static assertConfiguredForSwitch(env: TInstanceEncryptionKeyEnv): void {
    if (!env.ROOT_ENCRYPTION_KEY && !env.ENCRYPTION_KEY) {
      throw new RuleViolationError({
        message:
          "Root KMS encryption strategy is set to software. Please set the ENCRYPTION_KEY environment variable and restart your deployment before trying to update the encryption strategy to software mode."
      });
    }
  }

  /**
   * A label, never a lookup key: it lets an operator match a restored dump against an archived key. Truncated
   * SHA-256 over a key of at least 128 bits is not reversible, so it is safe to log and expose.
   */
  get label(): string {
    return createHash("sha256").update(KEK_LABEL_DOMAIN).update(this.buffer).digest("hex").slice(0, 32);
  }

  wrapRootKey(rootKey: RootKey): Buffer {
    return symmetricCipherService(SymmetricKeyAlgorithm.AES_GCM_256).encrypt(rootKey.exportForWrapping(), this.buffer);
  }

  unwrapRootKey(encryptedRootKey: Buffer): RootKey {
    return RootKey.fromBytes(
      symmetricCipherService(SymmetricKeyAlgorithm.AES_GCM_256).decrypt(encryptedRootKey, this.buffer)
    );
  }
}
