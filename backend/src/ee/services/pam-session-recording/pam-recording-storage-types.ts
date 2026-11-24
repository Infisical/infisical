import type { Agent } from "node:https";

import type { BlobServiceClient, StorageSharedKeyCredential, UserDelegationKey } from "@azure/storage-blob";

import { PamRecordingStorageBackend } from "./pam-recording-enums";

export type TPamRecordingChunkRef = {
  storageBackend: PamRecordingStorageBackend;
  externalChunkObjectKey?: string | null;
  encryptedEventsBlob?: Buffer | null;
};

export type TPamRecordingAzureAccess = {
  accountName: string;
  serviceClient: BlobServiceClient;
  sharedKeyCredential: StorageSharedKeyCredential | null;
  getUserDelegationKey: () => Promise<UserDelegationKey>;
};

export type TPamRecordingResolvedConfig = {
  backend: PamRecordingStorageBackend;
  bucket?: string;
  region?: string;
  endpoint?: string;
  getHttpsAgent?: () => Promise<Agent | undefined>;
  keyPrefix?: string | null;

  awsCredentials?: {
    accessKeyId: string;
    secretAccessKey: string;
    sessionToken?: string;
  };

  azure?: TPamRecordingAzureAccess;
};

export type TPamRecordingValidateConfig = (input: { config: TPamRecordingResolvedConfig }) => Promise<void>;

export type TPamRecordingMintPresignedPut = (input: {
  config: TPamRecordingResolvedConfig;
  projectId: string;
  sessionId: string;
  chunkIndex: number;
  ciphertextBytes: number;
  isKeyframe?: boolean;
}) => Promise<{
  url: string;
  objectKey: string;
  expiresInSeconds: number;
  method: "PUT";
  headers?: Record<string, string>;
}>;

export type TPamRecordingMintPresignedGet = (input: {
  config: TPamRecordingResolvedConfig;
  objectKey: string;
}) => Promise<{ url: string; expiresInSeconds: number }>;

export type TPamRecordingVerifyUploadedObject = (input: {
  config: TPamRecordingResolvedConfig;
  objectKey: string;
  ciphertextBytes: number;
}) => Promise<void>;

export type TPamRecordingDeleteSession = (input: {
  config: TPamRecordingResolvedConfig;
  projectId: string;
  sessionId: string;
}) => Promise<void>;

export type TPamRecordingStorageProvider = () => {
  validateConfig: TPamRecordingValidateConfig;
  mintPresignedPut: TPamRecordingMintPresignedPut;
  mintPresignedGet: TPamRecordingMintPresignedGet;
  verifyUploadedObject?: TPamRecordingVerifyUploadedObject;
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
