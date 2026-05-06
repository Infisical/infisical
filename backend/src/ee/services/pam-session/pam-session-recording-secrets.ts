import { crypto } from "@app/lib/crypto/cryptography";
import { BadRequestError, InternalServerError } from "@app/lib/errors";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { KmsDataKey } from "@app/services/kms/kms-types";

import { PAM_RECORDING_AAD_VERSION } from "../pam-session-recording-storage/pam-session-recording-storage-constants";

const SESSION_KEY_LENGTH = 32; // AES-256
const UPLOAD_TOKEN_LENGTH = 32; // 256 random bits

const buildWrapAad = (projectId: string, sessionId: string) =>
  crypto.nativeCrypto.createHash("sha256").update(`${projectId}|${sessionId}|${PAM_RECORDING_AAD_VERSION}`).digest();

export const generateSessionRecordingSecrets = async ({
  projectId,
  sessionId,
  kmsService
}: {
  projectId: string;
  sessionId: string;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
}) => {
  const sessionKey = crypto.randomBytes(SESSION_KEY_LENGTH);
  const uploadToken = crypto.randomBytes(UPLOAD_TOKEN_LENGTH);

  const wrapAad = buildWrapAad(projectId, sessionId);

  const { encryptor } = await kmsService.createCipherPairWithDataKey({
    type: KmsDataKey.SecretManager,
    projectId
  });

  // KMS createCipherPairWithDataKey doesn't expose a native AAD parameter, so we prepend the AAD bytes to the plaintext before wrapping
  // Unwrap then verifies the prefix matches the expected AAD with a constant-time compare
  const encryptionPayload = Buffer.concat([wrapAad, sessionKey]);
  const { cipherTextBlob: encryptedSessionKey } = encryptor({ plainText: encryptionPayload });

  const uploadTokenHash = crypto.nativeCrypto.createHash("sha256").update(uploadToken).digest();

  return {
    sessionKey,
    uploadToken,
    encryptedSessionKey,
    uploadTokenHash
  };
};

export const decryptSessionKey = async ({
  projectId,
  sessionId,
  encryptedSessionKey,
  kmsService
}: {
  projectId: string;
  sessionId: string;
  encryptedSessionKey: Buffer;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
}) => {
  const { decryptor } = await kmsService.createCipherPairWithDataKey({
    type: KmsDataKey.SecretManager,
    projectId
  });

  const decrypted = decryptor({ cipherTextBlob: encryptedSessionKey });
  if (decrypted.length !== 32 + SESSION_KEY_LENGTH) {
    throw new InternalServerError({ message: "Encrypted session key has unexpected size" });
  }
  const recoveredAad = decrypted.subarray(0, 32);
  const expectedAad = buildWrapAad(projectId, sessionId);
  if (!crypto.nativeCrypto.timingSafeEqual(recoveredAad, expectedAad)) {
    throw new InternalServerError({ message: "Session key AAD mismatch — refusing to unwrap" });
  }
  return decrypted.subarray(32, 32 + SESSION_KEY_LENGTH);
};

export const verifyGatewayUploadToken = (
  presentedTokenBase64: string | undefined | null,
  storedTokenHash: Buffer | null | undefined
) => {
  if (!presentedTokenBase64 || !storedTokenHash) {
    throw new BadRequestError({
      message: "Gateway upload token missing or session not configured for chunked uploads"
    });
  }
  let presentedBuf: Buffer;
  try {
    presentedBuf = Buffer.from(presentedTokenBase64, "base64");
  } catch {
    throw new BadRequestError({ message: "Invalid upload token" });
  }
  if (presentedBuf.length !== UPLOAD_TOKEN_LENGTH) {
    throw new BadRequestError({ message: "Invalid upload token" });
  }
  const presentedHash = crypto.nativeCrypto.createHash("sha256").update(presentedBuf).digest();
  if (presentedHash.length !== storedTokenHash.length) {
    throw new BadRequestError({ message: "Invalid upload token" });
  }
  if (!crypto.nativeCrypto.timingSafeEqual(presentedHash, storedTokenHash)) {
    throw new BadRequestError({ message: "Invalid upload token" });
  }
};

export const SESSION_KEY_BYTES = SESSION_KEY_LENGTH;
export const UPLOAD_TOKEN_BYTES = UPLOAD_TOKEN_LENGTH;
