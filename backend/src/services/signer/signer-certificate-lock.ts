import { KeyStorePrefixes, TKeyStoreFactory } from "@app/keystore/keystore";
import { ExecutionError, isLockHeldByAnotherOwner, ResourceLockedError } from "@app/lib/red-lock";

const SIGNER_CERTIFICATE_LOCK_TTL_MS = 10 * 60 * 1000;
const SIGNER_CERTIFICATE_LOCK_RETRY_DELAY_MS = 500;

export const acquireSignerCertificateLock = (
  keyStore: Pick<TKeyStoreFactory, "acquireLock">,
  signerId: string,
  { waitMs = 0 }: { waitMs?: number } = {}
) =>
  keyStore
    .acquireLock([KeyStorePrefixes.SignerCertificateLock(signerId)], SIGNER_CERTIFICATE_LOCK_TTL_MS, {
      retryCount: Math.ceil(waitMs / SIGNER_CERTIFICATE_LOCK_RETRY_DELAY_MS),
      retryDelay: SIGNER_CERTIFICATE_LOCK_RETRY_DELAY_MS
    })
    .catch(async (err: unknown) => {
      if (err instanceof ResourceLockedError) return null;
      if (err instanceof ExecutionError && (await isLockHeldByAnotherOwner(err))) return null;
      throw err;
    });
