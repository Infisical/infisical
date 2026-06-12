import { SessionEndReason } from "./pam-web-access-types";

export const rawBufferToString = (rawData: Buffer | ArrayBuffer | Buffer[]): string => {
  if (Buffer.isBuffer(rawData)) return rawData.toString();
  if (Array.isArray(rawData)) return Buffer.concat(rawData).toString();
  return Buffer.from(rawData).toString();
};

export const resolveEndReason = (isNearSessionExpiry: () => boolean): SessionEndReason =>
  isNearSessionExpiry() ? SessionEndReason.SessionCompleted : SessionEndReason.ConnectionLost;

export const parseClientMessage = <T>(
  rawData: Buffer | ArrayBuffer | Buffer[],
  schema: { safeParse: (data: unknown) => { success: true; data: T } | { success: false } }
): T | null => {
  const str = rawBufferToString(rawData);
  let parsed: unknown;
  try {
    parsed = JSON.parse(str);
  } catch {
    return null;
  }
  const result = schema.safeParse(parsed);
  return result.success ? result.data : null;
};
