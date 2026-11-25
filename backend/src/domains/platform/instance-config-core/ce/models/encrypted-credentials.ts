import { RuleViolationError } from "@app/domains/lib/errors";

// Encrypt and decrypt with the instance root key. The service hands them in from KMS Core.
export type TEncrypt = (plainText: Buffer) => Buffer;
export type TDecrypt = (cipherText: Buffer) => Buffer;

// One integration's app credentials as stored, each value encrypted on its own. The rules every integration shares
// live here; each subclass maps its own columns and decrypts to its own value object.
export abstract class EncryptedCredentials {
  // Slack and Teams values can be changed but not cleared; a GitHub app value is cleared with "".
  protected abstract readonly clearable: boolean;

  // The given value encrypted, or the current ciphertext when the value is undefined.
  protected encryptIfGiven(
    label: string,
    value: string | undefined,
    current: Buffer | null,
    encrypt: TEncrypt
  ): Buffer | null {
    if (value === undefined) return current;
    if (value === "" && !this.clearable) {
      throw new RuleViolationError({
        message: `${label} cannot be empty. Slack and Microsoft Teams credentials can be changed but not cleared.`
      });
    }
    return encrypt(Buffer.from(value));
  }

  // A value that is not set is "". Each column decrypts on its own, so one that cannot be read breaks only its
  // integration.
  protected static decryptText(cipherText: Buffer | null, decrypt: TDecrypt): string {
    return cipherText ? decrypt(cipherText).toString() : "";
  }
}
