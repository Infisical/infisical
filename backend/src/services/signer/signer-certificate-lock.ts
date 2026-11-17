import { KeyStorePrefixes, TKeyStoreFactory } from "@app/keystore/keystore";
import { ExecutionError, isLockHeldByAnotherOwner, ResourceLockedError } from "@app/lib/red-lock";

const SIGNER_CERTIFICATE_LOCK_TTL_MS = 10 * 60 * 1000;

export const withSignerCertificateLock = async <T>(
  keyStore: Pick<TKeyStoreFactory, "acquireLock">,
  signerId: string,
  onLockHeld: () => T | Promise<T>,
  fn: () => Promise<T>
): Promise<T> => {
  const lock = await keyStore
    .acquireLock([KeyStorePrefixes.SignerCertificateLock(signerId)], SIGNER_CERTIFICATE_LOCK_TTL_MS, {
      retryCount: 0
    })
    .catch(async (err: unknown) => {
      if (err instanceof ResourceLockedError) return null;
      if (err instanceof ExecutionError && (await isLockHeldByAnotherOwner(err))) return null;
      throw err;
    });
  if (!lock) return onLockHeld();
  try {
    return await fn();
  } finally {
    await lock.release().catch(() => {});
  }
};
