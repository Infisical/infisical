import { createHash } from "node:crypto";

import { BadRequestError } from "@app/lib/errors";

const KEK_LABEL_DOMAIN = "infisical:kek-fingerprint:v1";

export type TInstanceEncryptionKeyEnv = {
  ENCRYPTION_KEY?: string;
  ROOT_ENCRYPTION_KEY?: string;
};

// The env key that wraps the root key under the software strategy (the KEK).
export class InstanceEncryptionKey {
  private constructor(readonly buffer: Buffer) {}

  /**
   * The AES key an environment resolves to. Single-sourced: a rotation predicts exactly what a booting instance
   * will compute from the value it hands the operator, so a second copy of this rule would drift into a key that
   * does not boot.
   */
  static fromEnv(env: TInstanceEncryptionKeyEnv): InstanceEncryptionKey {
    const encryptionKey = env.ENCRYPTION_KEY || env.ROOT_ENCRYPTION_KEY;
    if (!encryptionKey) {
      throw new BadRequestError({
        message: "Instance encryption key not found. Did you set the ENCRYPTION_KEY environment variable?"
      });
    }

    const isUtf8Key = Boolean(env.ENCRYPTION_KEY);
    const buffer = Buffer.from(encryptionKey, isUtf8Key ? "utf8" : "base64");
    if (buffer.length !== 32) {
      throw new BadRequestError({
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

  /**
   * A label, never a lookup key: it lets an operator match a restored dump against an archived key. Truncated
   * SHA-256 over a key of at least 128 bits is not reversible, so it is safe to log and expose.
   */
  get label(): string {
    return createHash("sha256").update(KEK_LABEL_DOMAIN).update(this.buffer).digest("hex").slice(0, 32);
  }
}
