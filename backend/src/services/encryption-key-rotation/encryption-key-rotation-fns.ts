import { crypto } from "@app/lib/crypto/cryptography";
import { resolveInstanceEncryptionKeyBuffer } from "@app/services/kms/kms-fns";

export const generateRootEncryptionKey = (isFipsEnabled: boolean) =>
  isFipsEnabled ? crypto.randomBytes(32).toString("base64") : crypto.randomBytes(16).toString("hex");

export const resolveKekBuffer = (key: string, isFipsEnabled: boolean) =>
  resolveInstanceEncryptionKeyBuffer(isFipsEnabled ? { ROOT_ENCRYPTION_KEY: key } : { ENCRYPTION_KEY: key });

/** Later of supersededAt and lastResolvedAt plus retention; a straggler boot restarts the clock. */
export const getKeyRemovalEligibleAt = (
  row: { supersededAt: Date; lastResolvedAt?: Date | null },
  retentionDays: number
) => {
  const supersededAt = new Date(row.supersededAt).getTime();
  const lastResolvedAt = row.lastResolvedAt ? new Date(row.lastResolvedAt).getTime() : supersededAt;

  return new Date(Math.max(supersededAt, lastResolvedAt) + retentionDays * 24 * 60 * 60 * 1000);
};
