import { RuleViolationError } from "@app/domains/lib/errors";

import { InstanceEncryptionKey, TInstanceEncryptionKeyEnv } from "../../models/instance-encryption-key";
import { RootKey } from "../../models/root-key";
import { RootKeyConfig, RootKeyEncryptionStrategy } from "../../models/root-key-config";
import { TKmsCoreStores, TRootKeyWrapper } from "../dependencies";

// Null under HSM, where no env key is involved.
export const currentKekLabel = (env: TInstanceEncryptionKeyEnv): string | null => {
  try {
    return InstanceEncryptionKey.fromEnv(env).label;
  } catch {
    return null;
  }
};

export const requireWrapper = (wrapper: TRootKeyWrapper | undefined): TRootKeyWrapper => {
  if (!wrapper) {
    throw new RuleViolationError({
      message: "The root key is wrapped with an HSM, which requires the Infisical enterprise edition."
    });
  }
  return wrapper;
};

export const unwrapRootKey = async (
  config: RootKeyConfig,
  env: TInstanceEncryptionKeyEnv,
  wrapper: TRootKeyWrapper | undefined
): Promise<RootKey> => {
  if (config.strategy === RootKeyEncryptionStrategy.HSM) {
    const hsm = requireWrapper(wrapper);
    if (!(await hsm.isConfigured())) {
      throw new RuleViolationError({
        message: "Unable to decrypt root KMS key. HSM service is inactive. Did you configure the HSM?"
      });
    }
    return RootKey.fromBytes(await hsm.unwrap(config.encryptedRootKey));
  }
  if (config.strategy === RootKeyEncryptionStrategy.Software) {
    return InstanceEncryptionKey.fromEnv(env).unwrapRootKey(config.encryptedRootKey);
  }
  throw new RuleViolationError({ message: `Invalid root key encryption strategy: ${String(config.strategy)}` });
};

export const wrapRootKey = async (
  rootKey: RootKey,
  strategy: RootKeyEncryptionStrategy,
  env: TInstanceEncryptionKeyEnv,
  wrapper: TRootKeyWrapper | undefined
): Promise<Buffer> => {
  if (strategy === RootKeyEncryptionStrategy.HSM) {
    const hsm = requireWrapper(wrapper);
    if (!(await hsm.isConfigured())) {
      throw new RuleViolationError({
        message: "Unable to encrypt root KMS key. HSM service is inactive. Did you configure the HSM?"
      });
    }
    return hsm.wrap(rootKey.exportForWrapping());
  }
  if (strategy === RootKeyEncryptionStrategy.Software) {
    return InstanceEncryptionKey.fromEnv(env).wrapRootKey(rootKey);
  }
  throw new RuleViolationError({ message: `Invalid root key encryption strategy: ${strategy as string}` });
};

// False when the row was already gone, so a concurrent removal cannot report a deletion that did not happen.
export const removeRootKeyConfig = async (stores: TKmsCoreStores, row: RootKeyConfig): Promise<boolean> => {
  if (!(await stores.rootKeyConfigStore.delete(row.id))) return false;
  if (row.kekLabel) {
    const entry = await stores.kekHistoryStore.findActiveByLabel(row.kekLabel);
    if (entry) {
      entry.retire(new Date());
      await stores.kekHistoryStore.save(entry);
    }
  }
  return true;
};
