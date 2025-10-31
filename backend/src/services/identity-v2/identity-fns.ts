import { TKeyStoreFactory } from "@app/keystore/keystore";

export const getIdentityActiveLockoutAuthMethods = async (
  identityId: string,
  keyStore: Pick<TKeyStoreFactory, "getKeysByPattern" | "getItem">
) => {
  const activeLockouts = await keyStore.getKeysByPattern(`lockout:identity:${identityId}:*`);

  const activeLockoutAuthMethods = new Set<string>();
  for await (const key of activeLockouts) {
    const parts = key.split(":");
    if (parts.length > 3) {
      const lockoutRaw = await keyStore.getItem(key);
      if (lockoutRaw) {
        const lockout = JSON.parse(lockoutRaw) as { lockedOut: boolean };
        if (lockout.lockedOut) {
          activeLockoutAuthMethods.add(parts[3]);
        }
      }
    }
  }

  return Array.from(activeLockoutAuthMethods);
};
