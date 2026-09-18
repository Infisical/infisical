import { KeyStorePrefixes, KeyStoreTtls, TKeyStoreFactory } from "@app/keystore/keystore";
import { getConfig } from "@app/lib/config/env";
import { crypto } from "@app/lib/crypto/cryptography";
import { BadRequestError } from "@app/lib/errors";
import { normalizeEmail } from "@app/lib/validator";

export enum EmailDispatchPurpose {
  Signup = "signup",
  AccountRecovery = "account-recovery"
}

const MAX_UNCONFIRMED_SENDS_PER_MAILBOX = 5;

// Error codes for Redis operations
const OVER_LIMIT = -1;
const KEY_ABSENT = -2;

const computeHash = (key: string, pepper: string): string =>
  crypto.nativeCrypto.createHmac("sha256", pepper).update(key).digest("hex");

const probeWindow = () => Math.floor(Date.now() / (KeyStoreTtls.EmailDispatchAbuseProbeInSeconds * 1000));

export type TEmailDispatchGuardFactory = ReturnType<typeof emailDispatchGuardFactory>;

export const emailDispatchGuardFactory = ({
  keyStore
}: {
  keyStore: Pick<
    TKeyStoreFactory,
    | "setItemWithExpiryNX"
    | "ttl"
    | "incrementByAndRefreshExpiryIfUnderLimit"
    | "deleteItemsByKeyIn"
    | "probeDistinctMember"
  >;
}) => {
  // emailHash is the literal address (OTP verification); mailboxHash is normalized (all throttles below).
  const hashAddress = (email: string) => {
    const appCfg = getConfig();
    return {
      emailHash: computeHash(email, appCfg.AUTH_SECRET),
      mailboxHash: computeHash(normalizeEmail(email), appCfg.AUTH_SECRET)
    };
  };

  const checkMailboxCooldown = async ({ purpose, email }: { purpose: EmailDispatchPurpose; email: string }) => {
    const { emailHash, mailboxHash } = hashAddress(email);
    const cooldownKey = KeyStorePrefixes.EmailDispatchCooldown(purpose, mailboxHash);
    const remaining = await keyStore.ttl(cooldownKey);

    // ttl returns -2 when the key is absent and -1 when it exists without an expiry.
    if (remaining !== KEY_ABSENT) {
      throw new BadRequestError({
        message: "Please wait before requesting another email",
        details: { cooldownSeconds: Math.max(1, remaining) }
      });
    }

    return { emailHash, mailboxHash, cooldownSeconds: KeyStoreTtls.EmailDispatchCooldownInSeconds };
  };

  const startMailboxCooldown = async ({
    purpose,
    mailboxHash
  }: {
    purpose: EmailDispatchPurpose;
    mailboxHash: string;
  }) => {
    const cooldownKey = KeyStorePrefixes.EmailDispatchCooldown(purpose, mailboxHash);
    const cooldownSeconds = KeyStoreTtls.EmailDispatchCooldownInSeconds;

    const acquired = await keyStore.setItemWithExpiryNX(cooldownKey, cooldownSeconds, "1");
    if (!acquired) {
      const remaining = await keyStore.ttl(cooldownKey);
      throw new BadRequestError({
        message: "Please wait before requesting another email",
        details: { cooldownSeconds: Math.max(1, remaining) }
      });
    }
  };

  const consumeMailboxAllowance = async ({
    purpose,
    mailboxHash
  }: {
    purpose: EmailDispatchPurpose;
    mailboxHash: string;
  }): Promise<boolean> => {
    const count = await keyStore.incrementByAndRefreshExpiryIfUnderLimit(
      KeyStorePrefixes.EmailDispatchMailboxSends(purpose, mailboxHash),
      MAX_UNCONFIRMED_SENDS_PER_MAILBOX,
      KeyStoreTtls.EmailDispatchMailboxWindowInSeconds
    );

    return count !== OVER_LIMIT;
  };

  const clearMailboxThrottle = async ({
    purpose,
    mailboxHash
  }: {
    purpose: EmailDispatchPurpose;
    mailboxHash: string;
  }) => {
    await keyStore.deleteItemsByKeyIn([
      KeyStorePrefixes.EmailDispatchCooldown(purpose, mailboxHash),
      KeyStorePrefixes.EmailDispatchMailboxSends(purpose, mailboxHash)
    ]);
  };

  const probeTraffic = async ({
    purpose,
    mailboxHash,
    ip
  }: {
    purpose: EmailDispatchPurpose;
    mailboxHash: string;
    ip: string;
  }): Promise<{ isNewSource: boolean; isNewMailbox: boolean }> => {
    const appCfg = getConfig();
    const window = probeWindow();
    const ttl = KeyStoreTtls.EmailDispatchAbuseProbeInSeconds;

    const [isNewSource, isNewMailbox] = await Promise.all([
      keyStore.probeDistinctMember(
        KeyStorePrefixes.EmailDispatchSourceProbe(purpose, window),
        computeHash(ip, appCfg.AUTH_SECRET),
        ttl
      ),
      keyStore.probeDistinctMember(KeyStorePrefixes.EmailDispatchMailboxProbe(purpose, window), mailboxHash, ttl)
    ]);

    return { isNewSource, isNewMailbox };
  };

  return {
    hashAddress,
    checkMailboxCooldown,
    startMailboxCooldown,
    consumeMailboxAllowance,
    clearMailboxThrottle,
    probeTraffic
  };
};
