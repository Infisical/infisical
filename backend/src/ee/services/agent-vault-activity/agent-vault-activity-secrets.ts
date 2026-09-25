import { crypto } from "@app/lib/crypto/cryptography";
import { InternalServerError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { KmsDataKey } from "@app/services/kms/kms-types";

export const AGENT_VAULT_ACTIVITY_KEY_BYTES = 32;

const LABEL_BYTES = 32;

type TKmsDep = Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;

// The KMS wrap takes no context, so the session id travels inside the payload: a key copied onto another
// session's row fails to open there instead of being handed out.
const sessionLabel = (sessionId: string) => crypto.nativeCrypto.createHash("sha256").update(`${sessionId}|v1`).digest();

export const generateActivityKey = () => crypto.randomBytes(AGENT_VAULT_ACTIVITY_KEY_BYTES);

export const wrapActivityKey = async (
  { projectId, sessionId, activityKey }: { projectId: string; sessionId: string; activityKey: Buffer },
  kmsService: TKmsDep
) => {
  const { encryptor } = await kmsService.createCipherPairWithDataKey({
    type: KmsDataKey.SecretManager,
    projectId
  });
  return encryptor({ plainText: Buffer.concat([sessionLabel(sessionId), activityKey]) }).cipherTextBlob;
};

export const openActivityKey = ({ sessionId, payload }: { sessionId: string; payload: Buffer }) => {
  const belongs =
    payload.length === LABEL_BYTES + AGENT_VAULT_ACTIVITY_KEY_BYTES &&
    crypto.nativeCrypto.timingSafeEqual(payload.subarray(0, LABEL_BYTES), sessionLabel(sessionId));
  if (!belongs) {
    logger.error(`agentVaultActivity: stored activity key does not belong to its session [sessionId=${sessionId}]`);
    throw new InternalServerError({ message: "This session's activity key could not be used" });
  }
  return payload.subarray(LABEL_BYTES);
};

export const unwrapActivityKey = async (
  {
    projectId,
    sessionId,
    encryptedActivityKey
  }: { projectId: string; sessionId: string; encryptedActivityKey: Buffer },
  kmsService: TKmsDep
) => {
  const { decryptor } = await kmsService.createCipherPairWithDataKey({
    type: KmsDataKey.SecretManager,
    projectId
  });
  return openActivityKey({ sessionId, payload: decryptor({ cipherTextBlob: encryptedActivityKey }) });
};
