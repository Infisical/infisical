import { z } from "zod";

import { logger } from "@app/lib/logger";
import { recordDynamicSecretStatusChangeMetric } from "@app/lib/telemetry/metrics";

import { TDynamicSecretDALFactory } from "../dynamic-secret/dynamic-secret-dal";

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

export const recordDynamicSecretRevocationResult = async ({
  dynamicSecretDAL,
  dynamicSecretId,
  provider,
  isRevoked,
  wasFailing
}: {
  dynamicSecretDAL: Pick<TDynamicSecretDALFactory, "update">;
  dynamicSecretId: string;
  provider: string;
  isRevoked: boolean;
  wasFailing: boolean;
}) => {
  const isFailing = !isRevoked;
  if (wasFailing === isFailing) return;

  try {
    const flipped = await dynamicSecretDAL.update(
      { id: dynamicSecretId, revocationFailing: !isFailing },
      { revocationFailing: isFailing }
    );
    if (flipped.length) {
      recordDynamicSecretStatusChangeMetric({ provider, newStatus: isFailing ? "failed" : "healthy" });
    }
  } catch (error) {
    logger.warn(
      error,
      `Failed to record dynamic secret revocation result [dynamicSecretId=${dynamicSecretId}] [provider=${provider}]`
    );
  }
};
