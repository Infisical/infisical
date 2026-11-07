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
  objectVersionId?: string | null;
};

export type TPamSessionPlayback = {
  sessionComplete: boolean;
  sessionKey: string;
  projectId: string;
  storageBackend: TPamRecordingStorageBackend;
  chunks: TPamPlaybackChunk[];
  manifest?: {
    status: "complete" | "incomplete" | "mismatch";
    statusDetail: string | null;
    canonicalSha256: string;
    signature: string | null;
    signingKeyId: string | null;
    alg: string | null;
    finalizedAt: string;
    canonical: {
      chunks: { i: number; sha256: string; bytes: number; versionId?: string }[];
      [key: string]: unknown;
    };
  } | null;
  coverage?: {
    expectedChunks: number;
    presentChunks: number;
    missingIndices: number[];
    tailSealed: boolean;
    gaps: { fromElapsedUs: number; toElapsedUs: number; reason: string }[];
  };
  integrity?: {
    manifestStatus: string;
    manifestSignatureVerified: boolean;
    checkpointCount: number;
  };
  availability?: {
    verifiedChunks: number;
    checkedChunks: number;
    verifyCursor: number | null;
    storageBackend: string;
    protection: "participant-level";
    retentionLock: "not-verified";
    versionPinned: boolean;
  };
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
