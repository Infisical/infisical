import { symmetricCipherService, SymmetricEncryption } from "@app/lib/crypto/cipher";

const cipher = symmetricCipherService(SymmetricEncryption.AES_GCM_256);

export const encryptFields = (fields: Record<string, string>) => {
  const stringifiedFields = JSON.stringify(fields);
  const encryptionKey = process.env.ENCRYPTION_KEY || process.env.ROOT_ENCRYPTION_KEY;
  const isBase64 = !process.env.ENCRYPTION_KEY;
  if (!encryptionKey) {
    throw new Error("ENCRYPTION_KEY variable needed for migration");
  }
  const encryptionKeyBuffer = Buffer.from(encryptionKey, isBase64 ? "base64" : "utf8");
  const encryptedFields = cipher.encrypt(Buffer.from(stringifiedFields, "utf-8"), encryptionKeyBuffer);
  return encryptedFields.toString("base64");
};

export const decryptFields = (encryptedFields: string): Record<string, string> => {
  const encryptionKey = process.env.ENCRYPTION_KEY || process.env.ROOT_ENCRYPTION_KEY;
  const isBase64 = !process.env.ENCRYPTION_KEY;
  if (!encryptionKey) {
    throw new Error("ENCRYPTION_KEY variable needed for migration");
  }
  const encryptionKeyBuffer = Buffer.from(encryptionKey, isBase64 ? "base64" : "utf8");
  const decryptedFields = cipher.decrypt(Buffer.from(encryptedFields, "base64"), encryptionKeyBuffer);
  return JSON.parse(decryptedFields.toString("utf-8")) as Record<string, string>;
};
