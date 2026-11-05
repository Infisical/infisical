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

// Results are capped by size as well as row count: holding a result, its JSON and the send buffer costs a few times
// its size, so 1,000 wide rows can take gigabytes of memory on a server shared by every org.
export const DATA_EXPLORER_MAX_RESULT_BYTES = 16 * 1024 * 1024;

export const estimateRowBytes = (row: Record<string, unknown>): number =>
  Buffer.byteLength(
    JSON.stringify(row, (_key, value: unknown) => (typeof value === "bigint" ? value.toString() : value))
  );
