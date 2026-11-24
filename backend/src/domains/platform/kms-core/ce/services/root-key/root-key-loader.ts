import { ReadFrom } from "@app/domains/lib/data-access";
import { ExternalSystemError } from "@app/domains/lib/errors";
import { TTransactionRunner } from "@app/domains/lib/transactions";
import { setLegacyKeyMaterial, TLegacyKeySnapshot } from "@app/lib/crypto/legacy-key";
import { logger } from "@app/lib/logger";

import { KekHistoryEntry } from "../../models/kek-history-entry";
import { LegacyEncryptionKey } from "../../models/legacy-encryption-key";
import { RootKey } from "../../models/root-key";
import { KMS_ROOT_CONFIG_UUID, RootKeyConfig, RootKeyEncryptionStrategy } from "../../models/root-key-config";
import { RootKeyRing } from "../../models/root-key-ring";
import { TKmsCoreStores } from "../dependencies";
import { removeRootKeyConfig } from "./root-key-helpers";
import { RootKeyWrappings } from "./root-key-wrappings";
import type { TKmsCoreEnv } from "./service";

// The one place a pod learns the root key (bootstrapping it on an empty instance), plus the rotation bookkeeping a
// boot owns. Reads the primary: a lagging replica could miss the key this pod holds, or show a stale view to promote
// against.
export class RootKeyLoader {
  constructor(
    private readonly transactionRunner: TTransactionRunner<TKmsCoreStores>,
    private readonly stores: TKmsCoreStores,
    private readonly env: TKmsCoreEnv,
    private readonly rootKeyWrappings: RootKeyWrappings,
    // The env as first parsed, before the FIPS relabel replaced ROOT_ENCRYPTION_KEY.
    private readonly originalEnv?: TLegacyKeySnapshot,
    // For migrations. Historical ones start KMS Core long before the rotation columns and tables exist, so they only
    // load the root key (the legacy helpers fall back to the env, which is right for a migration).
    private readonly skipRotationState = false
  ) {}

  async load(): Promise<RootKey> {
    const active = await this.stores.rootKeyConfigStore
      .findById(KMS_ROOT_CONFIG_UUID, { readFrom: ReadFrom.Primary })
      .catch(() => null);
    const strategy = active?.strategy ?? null;
    const isHsmConfigured = await this.rootKeyWrappings.isHsmConfigured();

    // A new instance bootstraps on the HSM when one is plugged in, otherwise on the env key.
    if (strategy) this.rootKeyWrappings.for(strategy).assertCanBoot();
    else if (!isHsmConfigured) this.rootKeyWrappings.for(RootKeyEncryptionStrategy.Software).assertCanBoot();

    const rootKey = await this.resolve(isHsmConfigured);
    logger?.info("KMS: Loading ROOT Key into Memory.");

    if (this.skipRotationState) return rootKey;
    await this.ensureLegacyKeyMaterial(rootKey);
    await this.ensureKekHistory();
    return rootKey;
  }

  private async resolve(isHsmConfigured: boolean): Promise<RootKey> {
    const ring = RootKeyRing.of(await this.stores.rootKeyConfigStore.findAll({ readFrom: ReadFrom.Primary }));
    if (ring.isEmpty) return this.rootKeyWrappings.unwrap(await this.bootstrap(isHsmConfigured));

    const errors: unknown[] = [];
    for (const row of ring.resolutionOrder()) {
      // eslint-disable-next-line no-await-in-loop -- at most three rows, and the first hit returns
      const rootKey = await this.rootKeyWrappings.unwrap(row).then(
        (key) => key,
        (err: unknown) => {
          if (row.strategy === RootKeyEncryptionStrategy.HSM) throw err;
          errors.push(err);
          return null;
        }
      );
      if (rootKey) {
        // eslint-disable-next-line no-await-in-loop
        if (!this.skipRotationState) await this.recordResolution(row);
        return rootKey;
      }
    }

    const label = this.rootKeyWrappings.currentKekLabel;
    const history = await this.stores.kekHistoryStore.findPage({ offset: 0, limit: 5 }).catch(() => []);
    const known = history.map((entry) => entry.kekLabel).join(", ");
    logger?.error({ err: errors[0] }, "KMS: No stored root key could be decrypted with the configured encryption key");
    throw new ExternalSystemError({
      message: `The configured encryption key (label ${label ?? "unknown"}) does not decrypt this database's root key. ${
        known
          ? `This database was last written with encryption key label(s): ${known}. Set the matching key and restart.`
          : "Set the encryption key this database was created with and restart."
      }`
    });
  }

  private async bootstrap(isHsmConfigured: boolean): Promise<RootKeyConfig> {
    logger?.info(`KMS: Generating new ROOT Key with ${isHsmConfigured ? "HSM" : "software"} encryption`);
    const strategy = isHsmConfigured ? RootKeyEncryptionStrategy.HSM : RootKeyEncryptionStrategy.Software;
    const wrapping = this.rootKeyWrappings.for(strategy);
    const rootKey = await wrapping.generate();

    // Wrap before the transaction opens, since this can be an HSM round trip. A pod that loses the race below
    // discards its key unused.
    const encryptedRootKey = await wrapping.wrap(rootKey).catch((err) => {
      logger?.error({ hsmEnabled: isHsmConfigured, encryptionStrategy: strategy }, "KMS: Failed to encrypt ROOT Key");
      throw err;
    });

    return this.transactionRunner.run(async ({ stores }) => {
      await stores.locks.rootKey();
      const existing = await stores.rootKeyConfigStore.findById(KMS_ROOT_CONFIG_UUID);
      if (existing) return existing;
      const config = RootKeyConfig.bootstrap({
        encryptedRootKey,
        strategy,
        withRotationState: !this.skipRotationState
      });
      await stores.rootKeyConfigStore.insert(config);
      return config;
    });
  }

  // Rotation bookkeeping for the row that opened: promote it if staged, label it, stamp a retained copy.
  private async recordResolution(row: RootKeyConfig) {
    const label = this.rootKeyWrappings.currentKekLabel;
    if (row.isStaged && (await this.promote(row.id, label))) {
      logger?.info(`KMS: Promoted staged encryption key rotation [label=${label ?? "hsm"}] [rotationId=${row.id}]`);
    }

    if (!row.kekLabel && label) {
      await this.updateRow(row.id, (current) => current.labelWith(label)).catch((err: unknown) =>
        logger?.warn({ err }, "KMS: Failed to label a root key row")
      );
    }

    if (row.supersededAt) {
      await this.updateRow(row.id, (current) => current.recordResolution(new Date())).catch((err: unknown) =>
        logger?.warn({ err }, "KMS: Failed to record use of a superseded root key")
      );
      logger?.warn(
        `KMS: This instance started on a superseded encryption key [rootConfigId=${row.id}] [label=${
          label ?? "hsm"
        }]. Roll it onto the current key before the previous one is removed.`
      );
    }
  }

  // The moment a rotation takes effect, driven by a booting pod: generating a key changes nothing until it is deployed.
  private promote(stagedId: string, label: string | null): Promise<boolean> {
    return this.transactionRunner.run(async ({ stores }) => {
      await stores.locks.rootKey();
      const now = new Date();
      const promotion = RootKeyRing.of(await stores.rootKeyConfigStore.findAll()).promote(stagedId, label, now);
      if (!promotion) return false;

      const { active, retained, superseded } = promotion;
      await stores.rootKeyConfigStore.insert(retained);
      await stores.rootKeyConfigStore.save(active);
      await stores.rootKeyConfigStore.deleteAllStaged();

      const previous = await stores.kekHistoryStore.findCurrent();
      if (previous) {
        previous.supersede(now);
        await stores.kekHistoryStore.save(previous);
      }
      if (active.kekLabel) {
        await stores.kekHistoryStore.insert(KekHistoryEntry.create({ kekLabel: active.kekLabel, activatedAt: now }));
      }

      for (const stale of superseded) {
        // eslint-disable-next-line no-await-in-loop -- at most a couple of rows
        await removeRootKeyConfig(stores, stale);
        logger?.info(
          `KMS: Removed a key superseded by an earlier rotation [rootConfigId=${stale.id}] [label=${stale.kekLabel ?? "unknown"}]`
        );
      }
      return true;
    });
  }

  // Re-reads the row under the root key lock, so a stale copy never overwrites a promotion another pod just made.
  private updateRow(id: string, change: (row: RootKeyConfig) => boolean) {
    return this.transactionRunner.run(async ({ stores }) => {
      await stores.locks.rootKey();
      const row = await stores.rootKeyConfigStore.findById(id);
      if (row && change(row)) await stores.rootKeyConfigStore.save(row);
    });
  }

  // Snapshots the legacy tier's env keys under the root key, which survives an env key rotation.
  private async ensureLegacyKeyMaterial(rootKey: RootKey) {
    const findExisting = () => this.stores.legacyEncryptionKeyStore.find({ readFrom: ReadFrom.Primary });

    const existing = await findExisting();
    if (existing) {
      setLegacyKeyMaterial(existing.open(rootKey));
      return;
    }

    const material = LegacyEncryptionKey.materialFromEnv({
      current: { ENCRYPTION_KEY: this.env.ENCRYPTION_KEY, ROOT_ENCRYPTION_KEY: this.env.ROOT_ENCRYPTION_KEY },
      original: this.originalEnv
    });
    if (!material) return;

    await this.transactionRunner.run(async ({ stores }) => {
      await stores.locks.rootKey();
      if (await stores.legacyEncryptionKeyStore.find()) return;
      await stores.legacyEncryptionKeyStore.insert(LegacyEncryptionKey.create(material, rootKey));
    });

    // Re-read so every pod lands on the row that won the race, not its own candidate.
    const seeded = await findExisting();
    setLegacyKeyMaterial(seeded ? seeded.open(rootKey) : material);
  }

  // Backfills the key an instance already runs with, so a pre-rotation dump has a label to match an archived key.
  private async ensureKekHistory() {
    const label = this.rootKeyWrappings.currentKekLabel;
    if (!label) return;

    const current = await this.stores.kekHistoryStore.findCurrent({ readFrom: ReadFrom.Primary });
    if (current) return;
    const active = await this.stores.rootKeyConfigStore.findById(KMS_ROOT_CONFIG_UUID, {
      readFrom: ReadFrom.Primary
    });

    await this.transactionRunner
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
        logger?.warn({ err }, "KMS: Failed to record initial encryption key history entry");
      });
  }
}
