import { crypto } from "@app/lib/crypto/cryptography";

import { PAM_RECORDING_AAD_VERSION } from "./pam-recording-constants";

type TChunkAadInput = { projectId: string; sessionId: string; chunkIndex: number; storageBackend: string };

export const buildChunkAad = ({ projectId, sessionId, chunkIndex, storageBackend }: TChunkAadInput): Buffer =>
  crypto.nativeCrypto
    .createHash("sha256")
    .update(`${projectId}|${sessionId}|${chunkIndex}|${storageBackend}|${PAM_RECORDING_AAD_VERSION}`)
    .digest();

export const encryptChunk = ({
  plaintext,
  sessionKey,
  projectId,
  sessionId,
  chunkIndex,
  storageBackend
}: { plaintext: Buffer; sessionKey: Buffer } & TChunkAadInput) => {
  const iv = crypto.randomBytes(12);
  const aad = buildChunkAad({ projectId, sessionId, chunkIndex, storageBackend });
  const cipher = crypto.nativeCrypto.createCipheriv("aes-256-gcm", sessionKey, iv);
  cipher.setAAD(aad);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag(); // 16 bytes
  const body = Buffer.concat([ciphertext, authTag]);
  const ciphertextSha256 = crypto.nativeCrypto.createHash("sha256").update(body).digest();
  return { body, iv, ciphertextSha256 };
};
