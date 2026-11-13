import { ExternalSystemError } from "@app/domains/lib/errors";
import { TTransactionRunner } from "@app/domains/lib/transactions";
import { setLegacyKeyMaterial, TLegacyKeySnapshot } from "@app/lib/crypto/legacy-key";
import { logger } from "@app/lib/logger";

import { InstanceEncryptionKey } from "../../models/instance-encryption-key";
import { KekHistoryEntry } from "../../models/kek-history-entry";
import { LegacyEncryptionKey } from "../../models/legacy-encryption-key";
import { RootKey } from "../../models/root-key";
import { KMS_ROOT_CONFIG_UUID, RootKeyConfig, RootKeyEncryptionStrategy } from "../../models/root-key-config";
import { RootKeyRing } from "../../models/root-key-ring";
import { TKmsCoreStores, TRootKeyWrapper } from "../dependencies";
import { currentKekLabel, removeRootKeyConfig, requireWrapper, unwrapRootKey, wrapRootKey } from "./root-key-helpers";
import type { TKmsCoreEnv } from "./service";

export type TLoadRootKeyDeps = {
  transactionRunner: TTransactionRunner<TKmsCoreStores>;
  stores: TKmsCoreStores;
  env: TKmsCoreEnv;
  // The env as first parsed, before the FIPS relabel replaced ROOT_ENCRYPTION_KEY.
  originalEnv?: TLegacyKeySnapshot;
  isFipsEnabled: () => boolean;
  rootKeyWrapper: TRootKeyWrapper | undefined;
  /**
   * For callers inside a database migration. Historical migrations start KMS Core to re-encrypt data long before
   * the migration that adds the rotation columns and tables, so they only load the root key: no promotion, no
   * labels, no legacy snapshot (the legacy helpers fall back to the environment, which is right for a migration).
   */
  skipRotationState?: boolean;
};

// Root key state is read through the runner, which hits the primary: a lagging replica could miss the key this pod
// holds, or show a superseded view to promote against.
const readRing = (deps: TLoadRootKeyDeps) =>
  deps.transactionRunner.run(async ({ stores }) => RootKeyRing.of(await stores.rootKeyConfigStore.findAll()));

// Re-reads the row under the root key lock, so a stale copy never overwrites a promotion another pod just made.
const updateRow = (deps: TLoadRootKeyDeps, id: string, change: (row: RootKeyConfig) => boolean) =>
  deps.transactionRunner.run(async ({ stores }) => {
    await stores.locks.rootKey();
    const row = await stores.rootKeyConfigStore.findById(id);
    if (row && change(row)) await stores.rootKeyConfigStore.save(row);
  });

// The moment a rotation takes effect, driven by a booting pod: generating a key changes nothing until it is deployed.
const promoteRotation = (deps: TLoadRootKeyDeps, stagedId: string, label: string | null): Promise<boolean> =>
  deps.transactionRunner.run(async ({ stores }) => {
    await stores.locks.rootKey();
    const ring = RootKeyRing.of(await stores.rootKeyConfigStore.findAll());
    const staged = await stores.rootKeyConfigStore.findById(stagedId);
    // Another pod promoted first.
    if (!staged?.isStaged) return false;

    const { active } = ring;
    if (!active) throw new ExternalSystemError({ message: "KMS root config is missing its active row" });

    const now = new Date();
    const olderRetained = ring.retainedNewestFirst();

    // The grace window, so pods that have not rolled over can still boot. Not a rollback path.
    const retained = active.promote(staged, label, now);
    await stores.rootKeyConfigStore.insert(retained);
    await stores.rootKeyConfigStore.save(active);
    await stores.rootKeyConfigStore.deleteAllStaged();

    const promotedLabel = staged.kekLabel ?? label;
    const previous = await stores.kekHistoryStore.findCurrent();
    if (previous) {
      previous.supersede(now);
      await stores.kekHistoryStore.save(previous);
    }
    if (promotedLabel) {
      await stores.kekHistoryStore.insert(KekHistoryEntry.create({ kekLabel: promotedLabel, activatedAt: now }));
    }

    // Exactly one retained key survives a promotion.
    for (const stale of olderRetained) {
      // eslint-disable-next-line no-await-in-loop -- at most a couple of rows
      await removeRootKeyConfig(stores, stale);
      logger.info(
        `KMS: Removed a key superseded by an earlier rotation [rootConfigId=${stale.id}] [label=${stale.kekLabel ?? "unknown"}]`
      );
    }
    return true;
  });

// Rotation bookkeeping for the row that opened: promote it if staged, label it, stamp a retained copy.
const recordResolution = async (deps: TLoadRootKeyDeps, row: RootKeyConfig) => {
  const { env } = deps;
  if (row.isStaged) {
    const label = currentKekLabel(env);
    if (await promoteRotation(deps, row.id, label)) {
      logger.info(`KMS: Promoted staged encryption key rotation [label=${label ?? "hsm"}] [rotationId=${row.id}]`);
    }
  }

  if (!row.kekLabel) {
    const label = currentKekLabel(env);
    if (label) {
      await updateRow(deps, row.id, (current) => current.labelWith(label)).catch((err: unknown) =>
        logger.warn({ err }, "KMS: Failed to label a root key row")
      );
    }
  }

  if (row.supersededAt) {
    await updateRow(deps, row.id, (current) => current.recordResolution(new Date())).catch((err: unknown) =>
      logger.warn({ err }, "KMS: Failed to record use of a superseded root key")
    );
    logger.warn(
      `KMS: This instance started on a superseded encryption key [rootConfigId=${row.id}] [label=${
        currentKekLabel(env) ?? "hsm"
      }]. Roll it onto the current key before the previous one is removed.`
    );
  }
};

const bootstrapRootKey = async (deps: TLoadRootKeyDeps, isHsmConfigured: boolean): Promise<RootKeyConfig> => {
  const { transactionRunner, env, rootKeyWrapper, skipRotationState = false } = deps;
  logger.info(`KMS: Generating new ROOT Key with ${isHsmConfigured ? "HSM" : "software"} encryption`);
  const useHsm = isHsmConfigured && Boolean(rootKeyWrapper);
  const rootKey =
    useHsm && rootKeyWrapper ? RootKey.fromBytes(await rootKeyWrapper.randomBytes(32)) : RootKey.generate();
  const strategy = useHsm ? RootKeyEncryptionStrategy.HSM : RootKeyEncryptionStrategy.Software;

  // Wrapped before the transaction opens: this can be an HSM round trip. A pod that loses the race below
  // discards its key unused.
  const encryptedRootKey = await wrapRootKey(rootKey, strategy, env, rootKeyWrapper).catch((err) => {
    logger.error({ hsmEnabled: useHsm, encryptionStrategy: strategy }, "KMS: Failed to encrypt ROOT Key");
    throw err;
  });

  return transactionRunner.run(async ({ stores }) => {
    await stores.locks.rootKey();
    const existing = await stores.rootKeyConfigStore.findById(KMS_ROOT_CONFIG_UUID);
    if (existing) return existing;
    const config = RootKeyConfig.bootstrap({ encryptedRootKey, strategy, withRotationState: !skipRotationState });
    await stores.rootKeyConfigStore.insert(config);
    return config;
  });
};

const resolveRootKey = async (deps: TLoadRootKeyDeps, isHsmConfigured: boolean): Promise<RootKey> => {
  const { env, rootKeyWrapper, skipRotationState = false } = deps;
  const ring = await readRing(deps);
  if (ring.isEmpty) {
    const bootstrapped = await bootstrapRootKey(deps, isHsmConfigured);
    return unwrapRootKey(bootstrapped, env, rootKeyWrapper);
  }

  const errors: unknown[] = [];
  for (const row of ring.resolutionOrder()) {
    // eslint-disable-next-line no-await-in-loop -- at most three rows, and the first hit returns
    const rootKey = await unwrapRootKey(row, env, rootKeyWrapper).then(
      (key) => key,
      (err: unknown) => {
        if (row.strategy === RootKeyEncryptionStrategy.HSM) throw err;
        errors.push(err);
        return null;
      }
    );
    if (rootKey) {
      // eslint-disable-next-line no-await-in-loop
      if (!skipRotationState) await recordResolution(deps, row);
      return rootKey;
    }
  }

  const label = currentKekLabel(env);
  const history = await deps.stores.kekHistoryStore.findPage({ offset: 0, limit: 5 }).catch(() => []);
  const known = history.map((entry) => entry.kekLabel).join(", ");
  logger.error({ err: errors[0] }, "KMS: No stored root key could be decrypted with the configured encryption key");
  throw new ExternalSystemError({
    message: `The configured encryption key (label ${label ?? "unknown"}) does not decrypt this database's root key. ${
      known
        ? `This database was last written with encryption key label(s): ${known}. Set the matching key and restart.`
        : "Set the encryption key this database was created with and restart."
    }`
  });
};

// Snapshots the legacy tier's env keys under the root key, which survives an env key rotation.
const ensureLegacyKeyMaterial = async (deps: TLoadRootKeyDeps, rootKey: RootKey) => {
  const { transactionRunner, env, originalEnv } = deps;
  const findExisting = () => transactionRunner.run(({ stores }) => stores.legacyEncryptionKeyStore.find());

  const existing = await findExisting();
  if (existing) {
    setLegacyKeyMaterial(existing.open(rootKey));
    return;
  }

  const material = LegacyEncryptionKey.materialFromEnv({
    current: { ENCRYPTION_KEY: env.ENCRYPTION_KEY, ROOT_ENCRYPTION_KEY: env.ROOT_ENCRYPTION_KEY },
    original: originalEnv
  });
  if (!material) return;

  await transactionRunner.run(async ({ stores }) => {
    await stores.locks.rootKey();
    if (await stores.legacyEncryptionKeyStore.find()) return;
    await stores.legacyEncryptionKeyStore.insert(LegacyEncryptionKey.create(material, rootKey));
  });

  // Re-read so every pod lands on the row that won the race, not its own candidate.
  const seeded = await findExisting();
  setLegacyKeyMaterial(seeded ? seeded.open(rootKey) : material);
};

// Backfills the key an instance already runs with, so a pre-rotation dump has a label to match an archived key.
const ensureKekHistory = async (deps: TLoadRootKeyDeps) => {
  const { transactionRunner, env } = deps;
  const label = currentKekLabel(env);
  if (!label) return;

  const { hasCurrent, active } = await transactionRunner.run(async ({ stores }) => ({
    hasCurrent: Boolean(await stores.kekHistoryStore.findCurrent()),
    active: await stores.rootKeyConfigStore.findById(KMS_ROOT_CONFIG_UUID)
  }));
  if (hasCurrent) return;

  await transactionRunner
    .run(async ({ stores }) => {
      await stores.locks.rootKey();
      if (await stores.kekHistoryStore.findCurrent()) return;
      await stores.kekHistoryStore.insert(
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
};

// The one place a pod learns the root key: resolved from the stored configs (or bootstrapped on an empty
// instance), with the rotation bookkeeping a boot owns.
export const loadRootKey = async (deps: TLoadRootKeyDeps): Promise<RootKey> => {
  const { transactionRunner, env, isFipsEnabled, rootKeyWrapper, skipRotationState = false } = deps;

  const active = await transactionRunner
    .run(({ stores }) => stores.rootKeyConfigStore.findById(KMS_ROOT_CONFIG_UUID))
    .catch(() => null);
  const strategy = active?.strategy ?? null;
  const isHsmConfigured = rootKeyWrapper ? await rootKeyWrapper.isConfigured() : false;

  if (strategy === RootKeyEncryptionStrategy.HSM) requireWrapper(rootKeyWrapper).assertEntitled();

  const needsEncryptionKey = strategy === RootKeyEncryptionStrategy.Software || (strategy === null && !isHsmConfigured);
  if (needsEncryptionKey) InstanceEncryptionKey.assertConfigured(env, isFipsEnabled());

  const rootKey = await resolveRootKey(deps, isHsmConfigured);
  logger.info("KMS: Loading ROOT Key into Memory.");

  if (skipRotationState) return rootKey;
  await ensureLegacyKeyMaterial(deps, rootKey);
  await ensureKekHistory(deps);
  return rootKey;
};
