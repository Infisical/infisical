import { AWSRegion } from "@app/services/app-connection/app-connection-enums";

import { PamRecordingStorageBackend } from "./pam-session-recording-storage-enums";

export type TPamRecordingChunkRef = {
  storageBackend: PamRecordingStorageBackend;
  externalChunkObjectKey?: string | null;
  encryptedEventsBlob?: Buffer | null;
};

export type TPamRecordingResolvedConfig = {
  backend: PamRecordingStorageBackend;
  bucket?: string;
  region?: AWSRegion;
  keyPrefix?: string | null;

  // Pre-resolved AWS credentials when backend === AwsS3, otherwise undefined
  awsCredentials?: {
    accessKeyId: string;
    secretAccessKey: string;
    sessionToken?: string;
  };
};

export type TPamRecordingValidateConfig = (input: { config: TPamRecordingResolvedConfig }) => Promise<void>;

export type TPamRecordingMintPresignedPut = (input: {
  config: TPamRecordingResolvedConfig;
  projectId: string;
  sessionId: string;
  chunkIndex: number;
  ciphertextBytes: number;
  isKeyframe?: boolean;
}) => Promise<{ url: string; objectKey: string; expiresInSeconds: number; method: "PUT" }>;

export type TPamRecordingMintPresignedGet = (input: {
  config: TPamRecordingResolvedConfig;
  objectKey: string;
}) => Promise<{ url: string; expiresInSeconds: number }>;

export type TPamRecordingDeleteSession = (input: {
  config: TPamRecordingResolvedConfig;
  projectId: string;
  sessionId: string;
}) => Promise<void>;

export type TPamRecordingStorageProvider = () => {
  validateConfig: TPamRecordingValidateConfig;
  mintPresignedPut: TPamRecordingMintPresignedPut;
  mintPresignedGet: TPamRecordingMintPresignedGet;
  deleteSession: TPamRecordingDeleteSession;
};

export const normalizeKeyPrefix = (keyPrefix: string | null | undefined): string =>
  keyPrefix ? `${keyPrefix.replace(/^\/+|\/+$/g, "")}/` : "";

export const buildExternalChunkObjectKey = (
  keyPrefix: string | null | undefined,
  projectId: string,
  sessionId: string,
  chunkIndex: number,
  isKeyframe: boolean
): string => {
  const prefix = normalizeKeyPrefix(keyPrefix);
  const suffix = isKeyframe ? "keyframe.png.enc" : "json.enc";
  const padded = chunkIndex.toString().padStart(6, "0");
  return `${prefix}${projectId}/${sessionId}/chunk-${padded}.${suffix}`;
};
