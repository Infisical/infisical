import { createDecipheriv, createHash } from "node:crypto";

import { TPamSessionEventChunks } from "@app/db/schemas";
import { logger } from "@app/lib/logger";

import { PamRecordingStorageBackend } from "../pam-session-recording/pam-recording-enums";

const PAM_RECORDING_AAD_VERSION = "v1";

const buildChunkAad = (projectId: string, sessionId: string, chunkIndex: number, storageBackend: string): Buffer =>
  createHash("sha256")
    .update(`${projectId}|${sessionId}|${chunkIndex}|${storageBackend}|${PAM_RECORDING_AAD_VERSION}`)
    .digest();

const AUTH_TAG_LENGTH = 16;

const decryptSingleChunk = (
  chunk: TPamSessionEventChunks,
  sessionKey: Buffer,
  projectId: string,
  sessionId: string
): unknown[] => {
  if (!chunk.encryptedEventsBlob) return [];

  const aad = buildChunkAad(projectId, sessionId, chunk.chunkIndex, chunk.storageBackend);
  const ciphertext = chunk.encryptedEventsBlob;

  if (ciphertext.length < AUTH_TAG_LENGTH) return [];

  const encrypted = ciphertext.subarray(0, ciphertext.length - AUTH_TAG_LENGTH);
  const authTag = ciphertext.subarray(ciphertext.length - AUTH_TAG_LENGTH);

  try {
    const decipher = createDecipheriv("aes-256-gcm", sessionKey, chunk.iv);
    decipher.setAuthTag(authTag);
    decipher.setAAD(aad);
    const plaintext = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    const parsed: unknown = JSON.parse(plaintext.toString("utf-8"));
    if (Array.isArray(parsed)) {
      return parsed as unknown[];
    }
    return [];
  } catch (err) {
    logger.warn(
      { sessionId, chunkIndex: chunk.chunkIndex, err },
      `Failed to decrypt chunk [sessionId=${sessionId}] [chunkIndex=${chunk.chunkIndex}]`
    );
    return [];
  }
};

export const decryptChunks = (
  chunks: TPamSessionEventChunks[],
  sessionKey: Buffer,
  projectId: string,
  sessionId: string
): unknown[] => {
  const decryptable = chunks.filter(
    (c) => c.encryptedEventsBlob && c.storageBackend === PamRecordingStorageBackend.Postgres
  );

  return decryptable.flatMap((chunk) => decryptSingleChunk(chunk, sessionKey, projectId, sessionId));
};
