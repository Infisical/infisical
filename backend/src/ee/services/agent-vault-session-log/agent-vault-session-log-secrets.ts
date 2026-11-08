import { TKmsCoreDomain, WrappedKeyPayload } from "@app/domains/platform/kms-core/ce/module";
import { crypto } from "@app/lib/crypto/cryptography";
import { InternalServerError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";

const AGENT_VAULT_SESSION_LOG_KEY_BYTES = 32;

// The label names the session, so a key copied onto another session's row fails to open there instead of being
// handed out.
const sessionLabel = (sessionId: string) => `${sessionId}|v1`;

export const generateSessionLogKey = () => crypto.randomBytes(AGENT_VAULT_SESSION_LOG_KEY_BYTES);

export const wrapSessionLogKey = async (
  { projectId, sessionId, sessionLogKey }: { projectId: string; sessionId: string; sessionLogKey: Buffer },
  kmsCoreDomain: TKmsCoreDomain
) => kmsCoreDomain.wrapKey({ projectId, label: sessionLabel(sessionId), key: sessionLogKey });

const keyOrThrow = (sessionId: string, key: Buffer | null) => {
  if (!key) {
    logger.error(
      `agentVaultSessionLog: stored session log key does not belong to its session [sessionId=${sessionId}]`
    );
    throw new InternalServerError({ message: "This session's log key could not be used" });
  }
  return key;
};

// Opens a key the caller already decrypted with the project's data key. Proxy check-in uses it because it decrypts the
// service credentials with that same key.
export const openSessionLogKey = ({ sessionId, payload }: { sessionId: string; payload: Buffer }) =>
  keyOrThrow(
    sessionId,
    WrappedKeyPayload.restore(payload).open(sessionLabel(sessionId), AGENT_VAULT_SESSION_LOG_KEY_BYTES)
  );

export const unwrapSessionLogKey = async (
  {
    projectId,
    sessionId,
    encryptedSessionLogKey
  }: { projectId: string; sessionId: string; encryptedSessionLogKey: Buffer },
  kmsCoreDomain: TKmsCoreDomain
) =>
  keyOrThrow(
    sessionId,
    await kmsCoreDomain.unwrapKey({
      projectId,
      label: sessionLabel(sessionId),
      wrappedKey: encryptedSessionLogKey,
      keyBytes: AGENT_VAULT_SESSION_LOG_KEY_BYTES
    })
  );
