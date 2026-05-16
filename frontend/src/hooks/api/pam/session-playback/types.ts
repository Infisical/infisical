export type TPamRecordingStorageBackend = "postgres" | "aws-s3";

export type TPamPlaybackChunk = {
  chunkIndex: number;
  startElapsedMs: number;
  endElapsedMs: number;
  storageBackend: TPamRecordingStorageBackend;
  externalChunkObjectKey: string | null;
  ciphertextSha256: string;
  ciphertextBytes: number;
  iv: string;
  presignedGetUrl: string | null;
};

export type TPamPlaybackBundle = {
  legacy: boolean;
  sessionKey: string | null;
  projectId?: string;
  storageBackend?: TPamRecordingStorageBackend;
  chunks: TPamPlaybackChunk[];
};

export type TBrokenChunkMarker = {
  __brokenChunk: true;
  chunkIndex: number;
  reason: string;
  message: string;
};

export const isBrokenChunkMarker = (event: unknown): event is TBrokenChunkMarker =>
  typeof event === "object" &&
  event !== null &&
  // eslint-disable-next-line no-underscore-dangle
  (event as Record<string, unknown>).__brokenChunk === true &&
  typeof (event as Record<string, unknown>).chunkIndex === "number" &&
  typeof (event as Record<string, unknown>).reason === "string";
