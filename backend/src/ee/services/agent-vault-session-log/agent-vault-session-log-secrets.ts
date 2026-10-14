import { crypto } from "@app/lib/crypto/cryptography";
import { InternalServerError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { openWrappedKey } from "@app/services/kms/kms-fns";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";

const AGENT_VAULT_SESSION_LOG_KEY_BYTES = 32;

// The label is the session id, so a key copied onto another session's row fails to open there instead of being
// handed out.
const sessionLabel = (sessionId: string) => `${sessionId}|v1`;

export const generateSessionLogKey = () => crypto.randomBytes(AGENT_VAULT_SESSION_LOG_KEY_BYTES);

export const wrapSessionLogKey = async (
  { projectId, sessionId, sessionLogKey }: { projectId: string; sessionId: string; sessionLogKey: Buffer },
  kmsService: Pick<TKmsServiceFactory, "wrapKey">
) => kmsService.wrapKey({ projectId, label: sessionLabel(sessionId), key: sessionLogKey });

const keyOrThrow = (sessionId: string, key: Buffer | null) => {
  if (!key) {
    logger.error(
      `agentVaultSessionLog: stored session log key does not belong to its session [sessionId=${sessionId}]`
    );
    throw new InternalServerError({ message: "This session's log key could not be used" });
  }
  return key;
};

// For a caller that already holds the project's decryptor, such as proxy resolve, so it isn't derived twice.
export const openSessionLogKey = ({ sessionId, payload }: { sessionId: string; payload: Buffer }) =>
  keyOrThrow(
    sessionId,
    openWrappedKey({ label: sessionLabel(sessionId), payload, keyBytes: AGENT_VAULT_SESSION_LOG_KEY_BYTES })
  );

export const unwrapSessionLogKey = async (
  {
    projectId,
    sessionId,
    encryptedSessionLogKey
  }: { projectId: string; sessionId: string; encryptedSessionLogKey: Buffer },
  kmsService: Pick<TKmsServiceFactory, "unwrapKey">
) =>
  keyOrThrow(
    sessionId,
    await kmsService.unwrapKey({
      projectId,
      label: sessionLabel(sessionId),
      wrappedKey: encryptedSessionLogKey,
      keyBytes: AGENT_VAULT_SESSION_LOG_KEY_BYTES
    })
  );
