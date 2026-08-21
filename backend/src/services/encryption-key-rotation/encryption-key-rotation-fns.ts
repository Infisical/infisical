import { crypto } from "@app/lib/crypto/cryptography";
import { resolveInstanceEncryptionKeyBuffer } from "@app/services/kms/kms-fns";

export const generateRootEncryptionKey = (isFipsEnabled: boolean) =>
  isFipsEnabled ? crypto.randomBytes(32).toString("base64") : crypto.randomBytes(16).toString("hex");

export const resolveKekBuffer = (key: string, isFipsEnabled: boolean) =>
  resolveInstanceEncryptionKeyBuffer(isFipsEnabled ? { ROOT_ENCRYPTION_KEY: key } : { ENCRYPTION_KEY: key });
