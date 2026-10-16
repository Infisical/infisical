import { z } from "zod";

const LeaseDataSchema = z.record(z.string());

export const pickPersistedLeaseData = (data: unknown, fields: string[]): Record<string, string> => {
  const source = data && typeof data === "object" ? (data as Record<string, unknown>) : {};
  return Object.fromEntries(
    fields.flatMap((field) => {
      const value = source[field];
      return typeof value === "string" ? [[field, value]] : [];
    })
  );
};

export const decryptLeaseData = (
  decryptor: (dto: { cipherTextBlob: Buffer }) => Buffer,
  encryptedLeaseData?: Buffer | null
): Record<string, string> | undefined => {
  if (!encryptedLeaseData) return undefined;
  return LeaseDataSchema.parse(
    JSON.parse(decryptor({ cipherTextBlob: Buffer.from(encryptedLeaseData) }).toString()) as unknown
  );
};
