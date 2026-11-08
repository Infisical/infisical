import { TTransactionRunner } from "@app/domains/lib/transaction-runner";
import { isBase64 } from "@app/lib/base64";
import { symmetricCipherService, SymmetricKeyAlgorithm } from "@app/lib/crypto/cipher";
import { deriveCookieSigningKey } from "@app/lib/crypto/cookie-signing-key";
import { crypto } from "@app/lib/crypto/cryptography";
import { setLegacyKeyMaterial, TLegacyKeyMaterial, TLegacyKeySnapshot } from "@app/lib/crypto/legacy-key";
import { BadRequestError, CryptographyError, InternalServerError, NotFoundError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";

import { TKmsCoreStore } from "../data-access/kms-core-store";
import { InstanceEncryptionKey } from "../model/instance-encryption-key";
import { KekHistoryEntry } from "../model/kek-history-entry";
import { LegacyEncryptionKey } from "../model/legacy-encryption-key";
import { KMS_ROOT_CONFIG_UUID, RootKeyConfig, RootKeyEncryptionStrategy } from "../model/root-key-config";
import { TKmsCoreState, unwrapWithRootKey, wrapWithRootKey } from "./key-material";

export type TKmsCoreEnv = {
  ENCRYPTION_KEY?: string;
  ROOT_ENCRYPTION_KEY?: string;
  KMS_ROOT_KEY_RETENTION_DAYS: number;
  // Whether HSM variables are set, which decides whether HSM is offered as a strategy.
  isHsmConfigured: boolean;
};

export type TRootKeyStartOptions = {
  /**
   * For callers inside a database migration. Historical migrations start KMS Core to re-encrypt data long before
   * the migration that adds the rotation columns and tables, so they only load the root key: no promotion, no
   * labels, no legacy snapshot (the legacy helpers fall back to the environment, which is right for a migration).
   */
  skipRotationState?: boolean;
};

export type TEncryptionStrategyOption = { enabled: boolean; strategy: RootKeyEncryptionStrategy };

export type TRootKeyServiceDeps = {
  runner: TTransactionRunner<TKmsCoreStore>;
  // The primary, outside a transaction: root key state must never come from a lagging replica.
  primary: TKmsCoreStore;
  state: TKmsCoreState;
  env: TKmsCoreEnv;
  // The env as first parsed, before the FIPS relabel replaced ROOT_ENCRYPTION_KEY.
  originalEnv?: TLegacyKeySnapshot;
  isFipsEnabled: () => boolean;
};

const ROTATION_IN_PROGRESS =
  "An encryption key rotation is still in progress. Complete or discard it before changing the root key encryption strategy.";

export class RootKeyService {
  constructor(private readonly deps: TRootKeyServiceDeps) {}

  async start({ skipRotationState = false }: TRootKeyStartOptions = {}) {
    const { primary } = this.deps;
    const active = await primary.rootKeyConfigs.findById(KMS_ROOT_CONFIG_UUID).catch(() => undefined);
    const strategy = active?.strategy ?? null;
    const isHsmConfigured = await this.isHsmConfigured();

    if (strategy === RootKeyEncryptionStrategy.HSM) this.requireWrapper().assertEntitled();

    const needsEncryptionKey =
      strategy === RootKeyEncryptionStrategy.Software || (strategy === null && !isHsmConfigured);
    if (needsEncryptionKey) this.assertEncryptionKeyConfigured();

    const rootKey = await this.resolveRootKey(isHsmConfigured, skipRotationState);
    logger.info("KMS: Loading ROOT Key into Memory.");
    this.deps.state.rootKey.set(rootKey);

    if (skipRotationState) return;
    await this.ensureLegacyKeyMaterial();
    await this.ensureKekHistory();
  }

  encryptWithRootKey() {
    return (plainText: Buffer) => wrapWithRootKey(this.deps.state, plainText);
  }

  decryptWithRootKey() {
    return (cipherText: Buffer) => unwrapWithRootKey(this.deps.state, cipherText);
  }

  getCookieSigningKey() {
    return deriveCookieSigningKey(this.deps.state.rootKey.get());
  }

  // Null under HSM, where no env key is involved.
  currentKekLabel(): string | null {
    try {
      return InstanceEncryptionKey.fromEnv(this.deps.env).label;
    } catch {
      return null;
    }
  }

  async listEncryptionStrategies(): Promise<{ strategies: TEncryptionStrategyOption[] }> {
    const active = await this.deps.primary.rootKeyConfigs.findById(KMS_ROOT_CONFIG_UUID);
    if (!active) throw new NotFoundError({ name: "KmsRootConfig", message: "KMS root configuration not found" });

    const strategies: TEncryptionStrategyOption[] = [];
    if (this.deps.env.ROOT_ENCRYPTION_KEY || this.deps.env.ENCRYPTION_KEY) {
      strategies.push({
        enabled: active.strategy === RootKeyEncryptionStrategy.Software,
        strategy: RootKeyEncryptionStrategy.Software
      });
    }
    if (this.deps.env.isHsmConfigured) {
      strategies.push({
        enabled: active.strategy === RootKeyEncryptionStrategy.HSM,
        strategy: RootKeyEncryptionStrategy.HSM
      });
    }
    return { strategies };
  }

  // A fleet-wide cutover, so it is refused while a rotation is staged or retained: a pod holding the retained
  // software copy would otherwise boot without the device.
  async updateEncryptionStrategy(strategy: RootKeyEncryptionStrategy) {
    const { primary, env } = this.deps;
    const [staged, retained] = await Promise.all([
      primary.rootKeyConfigs.findStaged(),
      primary.rootKeyConfigs.findRetained()
    ]);
    if (staged.length || retained.length) throw new BadRequestError({ message: ROTATION_IN_PROGRESS });

    const active = await primary.rootKeyConfigs.findById(KMS_ROOT_CONFIG_UUID);
    if (!active) throw new NotFoundError({ message: "KMS root config not found" });
    if (active.strategy === strategy) return;

    if (strategy === RootKeyEncryptionStrategy.HSM) this.requireWrapper().assertEntitled();
    if (strategy === RootKeyEncryptionStrategy.Software && !env.ROOT_ENCRYPTION_KEY && !env.ENCRYPTION_KEY) {
      throw new BadRequestError({
        message:
          "Root KMS encryption strategy is set to software. Please set the ENCRYPTION_KEY environment variable and restart your deployment before trying to update the encryption strategy to software mode."
      });
    }

    if (active.strategy === RootKeyEncryptionStrategy.Software) {
      const currentLabel = this.currentKekLabel();
      if (active.kekLabel && currentLabel && active.kekLabel !== currentLabel) {
        throw new BadRequestError({
          message: `This instance is running with encryption key label '${currentLabel}', but the active root key was written with '${active.kekLabel}'. Restart it with the current encryption key before changing the root key encryption strategy.`
        });
      }
    }

    // Both can be HSM round trips, so they run before the transaction.
    const rootKey = await this.unwrapRootKey(active);
    const encryptedRootKey = await this.wrapRootKey(rootKey, strategy);

    await this.deps.runner.run(async ({ store }) => {
      await store.locks.rootKey();
      const [stagedNow, retainedNow, activeNow] = await Promise.all([
        store.rootKeyConfigs.findStaged(),
        store.rootKeyConfigs.findRetained(),
        store.rootKeyConfigs.findById(KMS_ROOT_CONFIG_UUID)
      ]);
      if (stagedNow.length || retainedNow.length) throw new BadRequestError({ message: ROTATION_IN_PROGRESS });
      if (!activeNow || !activeNow.encryptedRootKey.equals(active.encryptedRootKey)) {
        throw new BadRequestError({
          message:
            "The active root key changed while this request was in flight, so the encryption strategy was left unchanged. Retry the change."
        });
      }
      await store.rootKeyConfigs.update(KMS_ROOT_CONFIG_UUID, {
        encryptedRootKey,
        encryptionStrategy: strategy,
        kekLabel: strategy === RootKeyEncryptionStrategy.Software ? this.currentKekLabel() : null
      });
    });

    this.deps.state.rootKey.set(rootKey);
  }

  private async isHsmConfigured() {
    const wrapper = this.deps.state.hooks.rootKeyWrapper;
    return wrapper ? wrapper.isConfigured() : false;
  }

  private requireWrapper() {
    const wrapper = this.deps.state.hooks.rootKeyWrapper;
    if (!wrapper) {
      throw new BadRequestError({
        message: "The root key is wrapped with an HSM, which requires the Infisical enterprise edition."
      });
    }
    return wrapper;
  }

  private assertEncryptionKeyConfigured() {
    const { env } = this.deps;
    if (this.deps.isFipsEnabled()) {
      // Under FIPS the environment moves ENCRYPTION_KEY into ROOT_ENCRYPTION_KEY, so that is where it is checked.
      const key = env.ENCRYPTION_KEY ?? env.ROOT_ENCRYPTION_KEY;
      if (!key) {
        throw new CryptographyError({
          message:
            "FIPS mode is enabled, but the ENCRYPTION_KEY environment variable is not set.\nYou can generate a 256-bit key using the following command: `openssl rand -base64 32`"
        });
      }
      if (!isBase64(key)) {
        throw new CryptographyError({
          message:
            "FIPS mode is enabled, but the ENCRYPTION_KEY environment variable is not a base64 encoded 256-bit key.\nYou can generate a 256-bit key using the following command: `openssl rand -base64 32`"
        });
      }
      if (Buffer.from(key, "base64").length * 8 !== 256) {
        throw new CryptographyError({
          message:
            "FIPS mode is enabled, but the ENCRYPTION_KEY environment variable is not a 256-bit key.\nYou can generate a 256-bit key using the following command: `openssl rand -base64 32`"
        });
      }
    }
    if (!env.ROOT_ENCRYPTION_KEY && !env.ENCRYPTION_KEY) {
      throw new BadRequestError({
        message:
          "Root KMS encryption strategy is set to software. Please set the ENCRYPTION_KEY environment variable and restart your deployment.\nYou can enable HSM encryption in the Server Console."
      });
    }
  }

  private async unwrapRootKey(config: RootKeyConfig): Promise<Buffer> {
    if (config.strategy === RootKeyEncryptionStrategy.HSM) {
      const wrapper = this.requireWrapper();
      if (!(await wrapper.isConfigured())) {
        throw new BadRequestError({
          message: "Unable to decrypt root KMS key. HSM service is inactive. Did you configure the HSM?"
        });
      }
      return wrapper.unwrap(config.encryptedRootKey);
    }
    if (config.strategy === RootKeyEncryptionStrategy.Software) {
      const kek = InstanceEncryptionKey.fromEnv(this.deps.env).buffer;
      return symmetricCipherService(SymmetricKeyAlgorithm.AES_GCM_256).decrypt(config.encryptedRootKey, kek);
    }
    throw new BadRequestError({ message: `Invalid root key encryption strategy: ${String(config.strategy)}` });
  }

  private async wrapRootKey(rootKey: Buffer, strategy: RootKeyEncryptionStrategy): Promise<Buffer> {
    if (strategy === RootKeyEncryptionStrategy.HSM) {
      const wrapper = this.requireWrapper();
      if (!(await wrapper.isConfigured())) {
        throw new BadRequestError({
          message: "Unable to encrypt root KMS key. HSM service is inactive. Did you configure the HSM?"
        });
      }
      return wrapper.wrap(rootKey);
    }
    if (strategy === RootKeyEncryptionStrategy.Software) {
      const kek = InstanceEncryptionKey.fromEnv(this.deps.env).buffer;
      return symmetricCipherService(SymmetricKeyAlgorithm.AES_GCM_256).encrypt(rootKey, kek);
    }
    throw new BadRequestError({ message: `Invalid root key encryption strategy: ${strategy as string}` });
  }

  private async resolveRootKey(isHsmConfigured: boolean, skipRotationState: boolean): Promise<Buffer> {
    const rows = await this.deps.primary.rootKeyConfigs.findAll();
    if (!rows.length) return this.unwrapRootKey(await this.bootstrapRootKey(isHsmConfigured, skipRotationState));

    const errors: unknown[] = [];
    for (const row of RootKeyConfig.orderForResolution(rows)) {
      // eslint-disable-next-line no-await-in-loop -- at most three rows, and the first hit returns
      const rootKey = await this.unwrapRootKey(row).then(
        (key) => key,
        (err: unknown) => {
          if (row.strategy === RootKeyEncryptionStrategy.HSM) throw err;
          errors.push(err);
          return null;
        }
      );
      if (rootKey) {
        // eslint-disable-next-line no-await-in-loop
        if (!skipRotationState) await this.recordResolution(row);
        return rootKey;
      }
    }

    const label = this.currentKekLabel();
    const history = await this.deps.primary.kekHistory.findPage({ offset: 0, limit: 5 }).catch(() => []);
    const known = history.map((entry) => entry.kekLabel).join(", ");
    logger.error({ err: errors[0] }, "KMS: No stored root key could be decrypted with the configured encryption key");
    throw new InternalServerError({
      message: `The configured encryption key (label ${label ?? "unknown"}) does not decrypt this database's root key. ${
        known
          ? `This database was last written with encryption key label(s): ${known}. Set the matching key and restart.`
          : "Set the encryption key this database was created with and restart."
      }`
    });
  }

  // Rotation bookkeeping for the row that opened: promote it if staged, label it, stamp a retained copy.
  private async recordResolution(row: RootKeyConfig) {
    const { primary } = this.deps;
    if (row.isStaged) {
      const label = this.currentKekLabel();
      if (await this.promoteRotation(row.id, label)) {
        logger.info(`KMS: Promoted staged encryption key rotation [label=${label ?? "hsm"}] [rotationId=${row.id}]`);
      }
    }

    // Rows written before the label existed get it from the pod that can decrypt them, the only place it is derivable.
    if (!row.kekLabel) {
      const label = this.currentKekLabel();
      if (label) {
        await primary.rootKeyConfigs
          .update(row.id, { kekLabel: label })
          .catch((err: unknown) => logger.warn({ err }, "KMS: Failed to label a root key row"));
      }
    }

    // Only a retained copy is worth stamping: it is evidence a straggler still holds that key, which makes the
    // rotation GC decline to remove it.
    if (row.supersededAt) {
      await primary.rootKeyConfigs
        .update(row.id, { lastResolvedAt: new Date() })
        .catch((err: unknown) => logger.warn({ err }, "KMS: Failed to record use of a superseded root key"));
      logger.warn(
        `KMS: This instance started on a superseded encryption key [rootConfigId=${row.id}] [label=${
          this.currentKekLabel() ?? "hsm"
        }]. Roll it onto the current key before the previous one is removed.`
      );
    }
  }

  private async bootstrapRootKey(isHsmConfigured: boolean, skipRotationState: boolean): Promise<RootKeyConfig> {
    logger.info(`KMS: Generating new ROOT Key with ${isHsmConfigured ? "HSM" : "software"} encryption`);
    const wrapper = this.deps.state.hooks.rootKeyWrapper;
    const useHsm = isHsmConfigured && Boolean(wrapper);
    const rootKey = useHsm && wrapper ? await wrapper.randomBytes(32) : crypto.randomBytes(32);
    const strategy = useHsm ? RootKeyEncryptionStrategy.HSM : RootKeyEncryptionStrategy.Software;

    // Wrapped before the transaction opens: this can be an HSM round trip. A pod that loses the race below
    // discards its key unused.
    const encryptedRootKey = await this.wrapRootKey(rootKey, strategy).catch((err) => {
      logger.error({ hsmEnabled: useHsm, encryptionStrategy: strategy }, "KMS: Failed to encrypt ROOT Key");
      throw err;
    });

    return this.deps.runner.run(async ({ store }) => {
      await store.locks.rootKey();
      const existing = await store.rootKeyConfigs.findById(KMS_ROOT_CONFIG_UUID);
      if (existing) return existing;
      return store.rootKeyConfigs.create(
        RootKeyConfig.bootstrap({ encryptedRootKey, strategy, withRotationState: !skipRotationState })
      );
    });
  }

  // The moment a rotation takes effect, driven by a booting pod: generating a key changes nothing until it is deployed.
  private promoteRotation(stagedId: string, label: string | null): Promise<boolean> {
    return this.deps.runner.run(async ({ store }) => {
      await store.locks.rootKey();
      const staged = await store.rootKeyConfigs.findById(stagedId);
      // Another pod promoted first.
      if (!staged || staged.activatedAt) return false;

      const active = await store.rootKeyConfigs.findById(KMS_ROOT_CONFIG_UUID);
      if (!active) throw new InternalServerError({ message: "KMS root config is missing its active row" });

      const now = new Date();
      const olderRetained = await store.rootKeyConfigs.findRetained();

      // The grace window, so pods that have not rolled over can still boot. Not a rollback path.
      await store.rootKeyConfigs.create(active.retainedCopy(now));
      await store.rootKeyConfigs.update(KMS_ROOT_CONFIG_UUID, {
        encryptedRootKey: staged.encryptedRootKey,
        encryptionStrategy: staged.strategy ?? RootKeyEncryptionStrategy.Software,
        kekLabel: staged.kekLabel ?? label,
        activatedAt: now,
        supersededAt: null
      });
      await store.rootKeyConfigs.deleteAllStaged();

      const promotedLabel = staged.kekLabel ?? label;
      const previous = await store.kekHistory.findCurrent();
      if (previous) await store.kekHistory.markSuperseded(previous.id, now);
      if (promotedLabel)
        await store.kekHistory.create(KekHistoryEntry.create({ kekLabel: promotedLabel, activatedAt: now }));

      // Exactly one retained key survives a promotion.
      for (const stale of olderRetained) {
        // eslint-disable-next-line no-await-in-loop -- at most a couple of rows
        await store.rootKeyConfigs.deleteById(stale.id);
        // eslint-disable-next-line no-await-in-loop
        const entry = stale.kekLabel ? await store.kekHistory.findActiveByLabel(stale.kekLabel) : undefined;
        // eslint-disable-next-line no-await-in-loop
        if (entry) await store.kekHistory.markRetired(entry.id, now);
        logger.info(
          `KMS: Removed a key superseded by an earlier rotation [rootConfigId=${stale.id}] [label=${stale.kekLabel ?? "unknown"}]`
        );
      }
      return true;
    });
  }

  private parseLegacySnapshot(encrypted: Buffer) {
    return JSON.parse(unwrapWithRootKey(this.deps.state, encrypted).toString("utf8")) as TLegacyKeyMaterial;
  }

  // Snapshots the legacy tier's env keys under the root key, which survives an env key rotation.
  private async ensureLegacyKeyMaterial() {
    const { primary, env, originalEnv } = this.deps;
    const existing = await primary.legacyEncryptionKeys.find();
    if (existing) {
      setLegacyKeyMaterial(this.parseLegacySnapshot(existing.encryptedKeySnapshot));
      return;
    }

    const current: TLegacyKeySnapshot = {
      ENCRYPTION_KEY: env.ENCRYPTION_KEY,
      ROOT_ENCRYPTION_KEY: env.ROOT_ENCRYPTION_KEY
    };
    // The FIPS relabel overwrites ROOT_ENCRYPTION_KEY, so `current` can miss the key existing rows were written under.
    const original: TLegacyKeySnapshot | undefined = originalEnv
      ? { ENCRYPTION_KEY: originalEnv.ENCRYPTION_KEY, ROOT_ENCRYPTION_KEY: originalEnv.ROOT_ENCRYPTION_KEY }
      : undefined;
    const hasKey = (snapshot?: TLegacyKeySnapshot) =>
      Boolean(snapshot && (snapshot.ENCRYPTION_KEY || snapshot.ROOT_ENCRYPTION_KEY));

    // Pure HSM, no env key: the legacy tier keeps throwing as it does today.
    if (!hasKey(current) && !hasKey(original)) return;

    const material: TLegacyKeyMaterial = { current, original };
    const encryptedKeySnapshot = wrapWithRootKey(this.deps.state, Buffer.from(JSON.stringify(material), "utf8"));

    await this.deps.runner.run(async ({ store }) => {
      await store.locks.rootKey();
      if (await store.legacyEncryptionKeys.find()) return;
      await store.legacyEncryptionKeys.create(LegacyEncryptionKey.create(encryptedKeySnapshot));
    });

    // Re-read so every pod lands on the row that won the race, not its own candidate.
    const seeded = await primary.legacyEncryptionKeys.find();
    setLegacyKeyMaterial(seeded ? this.parseLegacySnapshot(seeded.encryptedKeySnapshot) : material);
  }

  // Backfills the key an instance already runs with, so a pre-rotation dump has a label to match an archived key.
  private async ensureKekHistory() {
    const label = this.currentKekLabel();
    if (!label) return;
    if (await this.deps.primary.kekHistory.findCurrent()) return;

    const active = await this.deps.primary.rootKeyConfigs.findById(KMS_ROOT_CONFIG_UUID);
    await this.deps.runner
      .run(async ({ store }) => {
        await store.locks.rootKey();
        if (await store.kekHistory.findCurrent()) return;
        await store.kekHistory.create(
          KekHistoryEntry.create({
            kekLabel: label,
            activatedAt: active?.activatedAt ?? active?.createdAt ?? new Date()
          })
        );
      })
      .catch((err: unknown) => {
        // Never block boot on a bookkeeping row.
        logger.warn({ err }, "KMS: Failed to record initial encryption key history entry");
      });
  }
}
