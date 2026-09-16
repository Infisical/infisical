import { crypto } from "@app/lib/crypto/cryptography";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { KmsDataKey } from "@app/services/kms/kms-types";

export const AGENT_VAULT_ACTIVITY_KEY_BYTES = 32;

type TKmsDep = Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;

/**
 * One AES-256 key per session, wrapped with the project data key and stored on the session row. The proxy
 * gets it at resolve to seal chunks; the browser gets it at playback to open them. Per-session rather than
 * per-project so a leaked key exposes one session's activity, never the org's stored credentials.
 */
export const generateActivityKey = () => crypto.randomBytes(AGENT_VAULT_ACTIVITY_KEY_BYTES);

export const wrapActivityKey = async (
  { projectId, activityKey }: { projectId: string; activityKey: Buffer },
  kmsService: TKmsDep
) => {
  const { encryptor } = await kmsService.createCipherPairWithDataKey({
    type: KmsDataKey.SecretManager,
    projectId
  });
  return encryptor({ plainText: activityKey }).cipherTextBlob;
};

export const unwrapActivityKey = async (
  { projectId, encryptedActivityKey }: { projectId: string; encryptedActivityKey: Buffer },
  kmsService: TKmsDep
) => {
  const { decryptor } = await kmsService.createCipherPairWithDataKey({
    type: KmsDataKey.SecretManager,
    projectId
  });
  return decryptor({ cipherTextBlob: encryptedActivityKey });
};
