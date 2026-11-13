import { EntityNotFoundError, RuleViolationError } from "@app/domains/lib/errors";
import { TTransactionRunner } from "@app/domains/lib/transactions";
import { crypto } from "@app/lib/crypto/cryptography";
import { logger } from "@app/lib/logger";

import { InstanceEncryptionKey } from "../../models/instance-encryption-key";
import { RootKey } from "../../models/root-key";
import { RootKeyConfig, RootKeyEncryptionStrategy } from "../../models/root-key-config";
import { RootKeyRing } from "../../models/root-key-ring";
import { TKmsCoreStores, TRootKeyWrapper } from "../dependencies";
import { currentKekLabel, removeRootKeyConfig, requireWrapper, unwrapRootKey, wrapRootKey } from "./root-key-helpers";

export type TKmsCoreEnv = {
  ENCRYPTION_KEY?: string;
  ROOT_ENCRYPTION_KEY?: string;
  KMS_ROOT_KEY_RETENTION_DAYS: number;
  // Whether HSM variables are set, which decides whether HSM is offered as a strategy.
  isHsmConfigured: boolean;
};

export type TEncryptionStrategyOption = { enabled: boolean; strategy: RootKeyEncryptionStrategy };

export type TRootKeyStatus = {
  encryptionStrategy: string | null;
  active: { label: string | null; activatedAt: Date };
  staged: { label: string | null; createdAt: Date } | null;
  expiring: { label: string | null; supersededAt: Date; lastResolvedAt: Date | null; expiresAt: Date } | null;
};

export type TRotationHistoryEntry = {
  label: string;
  activatedAt: Date;
  supersededAt: Date | null;
  retiredAt: Date | null;
};

export type TCreatedRotation = {
  label: string;
  // Returned exactly once. Never stored, never logged.
  key: string;
  // Set when the previous rotation's key has not been removed yet: applying this key removes it immediately.
  removesExpiringKey?: { label: string | null; lastResolvedAt: Date | null };
};

export type TRootKeyService = {
  encryptWithRootKey(): (plainText: Buffer) => Buffer<ArrayBuffer>;
  decryptWithRootKey(): (cipherText: Buffer) => Buffer<ArrayBuffer>;
  getCookieSigningKey(): string;
  listEncryptionStrategies(): Promise<{ strategies: TEncryptionStrategyOption[] }>;
  updateEncryptionStrategy(strategy: RootKeyEncryptionStrategy): Promise<void>;
  getRootKey(): Promise<TRootKeyStatus>;
  listRotations(page: { offset: number; limit: number }): Promise<{
    rotations: TRotationHistoryEntry[];
    totalCount: number;
  }>;
  createRotation(input: { replaceStaged?: boolean }): Promise<TCreatedRotation>;
  deleteStagedKey(input: { label: string }): Promise<void>;
  deleteExpiringKey(input: { label: string; force?: boolean }): Promise<void>;
  removeInactiveKeys(): Promise<void>;
};

export class RootKeyService implements TRootKeyService {
  constructor(
    private readonly transactionRunner: TTransactionRunner<TKmsCoreStores>,
    private readonly rootKey: RootKey,
    private readonly env: TKmsCoreEnv,
    private readonly isFipsEnabled: () => boolean,
    private readonly rootKeyWrapper: TRootKeyWrapper | undefined
  ) {}

  encryptWithRootKey() {
    return (plainText: Buffer) => this.rootKey.encrypt(plainText);
  }

  decryptWithRootKey() {
    return (cipherText: Buffer) => this.rootKey.decrypt(cipherText);
  }

  getCookieSigningKey() {
    return this.rootKey.cookieSigningKey();
  }

  async listEncryptionStrategies() {
    const ring = await this.readRing();
    const { active } = ring;
    if (!active) throw new EntityNotFoundError({ name: "KmsRootConfig", message: "KMS root configuration not found" });

    const strategies: TEncryptionStrategyOption[] = [];
    if (this.env.ROOT_ENCRYPTION_KEY || this.env.ENCRYPTION_KEY) {
      strategies.push({
        enabled: active.strategy === RootKeyEncryptionStrategy.Software,
        strategy: RootKeyEncryptionStrategy.Software
      });
    }
    if (this.env.isHsmConfigured) {
      strategies.push({
        enabled: active.strategy === RootKeyEncryptionStrategy.HSM,
        strategy: RootKeyEncryptionStrategy.HSM
      });
    }
    return { strategies };
  }

  async updateEncryptionStrategy(strategy: RootKeyEncryptionStrategy) {
    const ring = await this.readRing();
    ring.assertNoRotationInProgress();

    const active = ring.requireActive();
    if (active.strategy === strategy) return;

    if (strategy === RootKeyEncryptionStrategy.HSM) requireWrapper(this.rootKeyWrapper).assertEntitled();
    if (strategy === RootKeyEncryptionStrategy.Software) InstanceEncryptionKey.assertConfiguredForSwitch(this.env);
    active.assertWrittenWith(currentKekLabel(this.env));

    // Both can be HSM round trips, so they run before the transaction.
    const rootKey = await unwrapRootKey(active, this.env, this.rootKeyWrapper);
    const encryptedRootKey = await wrapRootKey(rootKey, strategy, this.env, this.rootKeyWrapper);

    await this.transactionRunner.run(async ({ stores }) => {
      await stores.locks.rootKey();
      const ringNow = RootKeyRing.of(await stores.rootKeyConfigStore.findAll());
      ringNow.assertNoRotationInProgress();
      const activeNow = ringNow.requireActive();
      activeNow.assertWrappedAs(active.encryptedRootKey);
      activeNow.rewrap(encryptedRootKey, strategy, currentKekLabel(this.env));
      await stores.rootKeyConfigStore.save(activeNow);
    });
  }

  async getRootKey(): Promise<TRootKeyStatus> {
    const ring = await this.readRing();
    return ring.status(this.env.KMS_ROOT_KEY_RETENTION_DAYS, currentKekLabel(this.env));
  }

  async listRotations({ offset, limit }: { offset: number; limit: number }) {
    const [rows, totalCount] = await this.transactionRunner.run(({ stores }) =>
      Promise.all([stores.kekHistoryStore.findPage({ offset, limit }), stores.kekHistoryStore.count()])
    );
    const rotations: TRotationHistoryEntry[] = rows.map((row) => {
      const record = row.toJSON();
      return {
        label: record.kekLabel,
        activatedAt: record.activatedAt,
        supersededAt: record.supersededAt ?? null,
        retiredAt: record.retiredAt ?? null
      };
    });
    return { rotations, totalCount };
  }

  // Inert by design: the active key is untouched until a pod boots with the new value.
  async createRotation({ replaceStaged = false }: { replaceStaged?: boolean }): Promise<TCreatedRotation> {
    const ringBefore = await this.readRing();
    ringBefore.assertCanStage(replaceStaged);

    const result = await this.transactionRunner.run(async ({ stores }) => {
      await stores.locks.rootKey();

      // Re-read under the lock: a strategy change to HSM holds the same lock, and a pod may have applied the staged key.
      const ring = RootKeyRing.of(await stores.rootKeyConfigStore.findAll());
      ring.assertCanStage(replaceStaged);
      ring.assertStagedNotApplied(ringBefore);
      if (ring.staged) await stores.rootKeyConfigStore.deleteAllStaged();

      const isFipsEnabled = this.isFipsEnabled();
      const key = isFipsEnabled ? crypto.randomBytes(32).toString("base64") : crypto.randomBytes(16).toString("hex");
      const kek = InstanceEncryptionKey.fromRotationValue(key, isFipsEnabled);
      const row = RootKeyConfig.stage({ encryptedRootKey: kek.wrapRootKey(this.rootKey), kekLabel: kek.label });
      await stores.rootKeyConfigStore.insert(row);
      return { row, retained: ring.retained, key, label: kek.label };
    });

    logger.info(`Encryption key rotation staged [rotationId=${result.row.id}] [label=${result.label}]`);
    return {
      label: result.label,
      key: result.key,
      ...(result.retained
        ? { removesExpiringKey: { label: result.retained.kekLabel, lastResolvedAt: result.retained.lastResolvedAt } }
        : {})
    };
  }

  async deleteStagedKey({ label }: { label: string }) {
    await this.transactionRunner.run(async ({ stores }) => {
      await stores.locks.rootKey();
      const { staged } = RootKeyRing.of(await stores.rootKeyConfigStore.findAll());
      if (!staged) throw new EntityNotFoundError({ message: "There is no staged encryption key to discard." });
      staged.assertNamed(label);

      if (!(await stores.rootKeyConfigStore.delete(staged.id))) {
        throw new RuleViolationError({
          message:
            "The key was applied by a running instance while this request was in flight, so it could not be discarded. There is no rollback once a rotation takes effect."
        });
      }
      logger.info(
        `Encryption key rotation discarded [rotationId=${staged.id}] [label=${staged.kekLabel ?? "unknown"}]`
      );
    });
  }

  async deleteExpiringKey({ label, force = false }: { label: string; force?: boolean }) {
    await this.transactionRunner.run(async ({ stores }) => {
      await stores.locks.rootKey();
      const { retained } = RootKeyRing.of(await stores.rootKeyConfigStore.findAll());
      if (!retained) throw new EntityNotFoundError({ message: "There is no previous encryption key to remove." });
      retained.assertNamed(label);

      if (retained.assertRemovable(new Date(), force)) {
        logger.warn(
          `Removing an encryption key an instance started on at ${new Date(
            retained.lastResolvedAt as Date
          ).toISOString()}, forced by the caller [retainedKeyId=${retained.id}]`
        );
      }

      if (!(await removeRootKeyConfig(stores, retained))) {
        throw new RuleViolationError({
          message: "The previous encryption key was already removed while this request was in flight."
        });
      }
      logger.info(
        `Encryption key rotation completed, previous key removed [retainedKeyId=${retained.id}] [label=${retained.kekLabel ?? "unknown"}]`
      );
    });
  }

  // The weekly cron: drops abandoned staged keys and retained keys past their retention.
  async removeInactiveKeys() {
    const retentionDays = this.env.KMS_ROOT_KEY_RETENTION_DAYS;
    const ring = await this.readRing();
    const retained = ring.retainedNewestFirst();
    const { staged } = ring;

    const now = new Date();
    if (staged?.isAbandoned(now)) {
      const removed = await this.transactionRunner.run(async ({ stores }) => {
        await stores.locks.rootKey();
        // A pod may have promoted it, in which case it is the active key.
        const current = await stores.rootKeyConfigStore.findById(staged.id);
        if (!current?.isStaged) return false;
        return stores.rootKeyConfigStore.delete(staged.id);
      });
      if (removed) {
        logger.info(
          `Discarded an encryption key rotation that was never applied [rotationId=${staged.id}] [label=${staged.kekLabel ?? "unknown"}]`
        );
      }
    }

    if (!retained.length) return;

    // lastResolvedAt can only prove presence: a straggler that never restarts leaves no stamp, so the retention
    // window covers it. Getting it wrong costs an instance that fails its next restart naming the key it needs.
    const eligible = retained.filter((row) => row.isRemovalDue(now, retentionDays));
    for (const row of eligible) {
      // eslint-disable-next-line no-await-in-loop -- at most a couple of rows
      const removed = await this.transactionRunner.run(async ({ stores }) => {
        await stores.locks.rootKey();
        const current = await stores.rootKeyConfigStore.findById(row.id);
        if (!current?.isRetained || !current.isRemovalDue(new Date(), retentionDays)) return false;
        return removeRootKeyConfig(stores, current);
      });
      if (removed) {
        logger.info(
          `Removed a superseded encryption key [retainedKeyId=${row.id}] [label=${row.kekLabel ?? "unknown"}]`
        );
      }
    }

    for (const row of retained.filter((candidate) => !eligible.includes(candidate) && candidate.lastResolvedAt)) {
      logger.info(
        `Keeping the previous encryption key: an instance started on it at ${new Date(
          row.lastResolvedAt as Date
        ).toISOString()} [retainedKeyId=${row.id}]`
      );
    }
  }

  // Reads inside a run so the primary answers: a lagging replica could show a superseded view.
  private readRing() {
    return this.transactionRunner.run(async ({ stores }) => RootKeyRing.of(await stores.rootKeyConfigStore.findAll()));
  }
}
