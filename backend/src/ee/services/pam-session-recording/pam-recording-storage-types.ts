import { AWSRegion } from "@app/services/app-connection/app-connection-enums";

import { PamRecordingStorageBackend } from "./pam-recording-enums";

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
  // When set, the URL only accepts a body with this SHA-256, and `headers` names what the uploader must send
  ciphertextSha256Base64?: string;
}) => Promise<{
  url: string;
  objectKey: string;
  expiresInSeconds: number;
  method: "PUT";
  headers?: Record<string, string>;
}>;

export type TPamRecordingStoredObject = {
  sizeBytes: number;
  // Present only when the object was uploaded with a SHA-256 checksum
  sha256Base64?: string;
};

export type TPamRecordingDescribeObject = (input: {
  config: TPamRecordingResolvedConfig;
  objectKey: string;
}) => Promise<TPamRecordingStoredObject | null>;

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
  // Object-storage backends only: what was actually written under a key, so metadata can be checked against it
  describeObject?: TPamRecordingDescribeObject;
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
