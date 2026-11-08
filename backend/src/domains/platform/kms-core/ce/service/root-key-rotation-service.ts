import { TTransactionRunner } from "@app/domains/lib/transaction-runner";
import { symmetricCipherService, SymmetricKeyAlgorithm } from "@app/lib/crypto/cipher";
import { crypto } from "@app/lib/crypto/cryptography";
import { BadRequestError, ConflictError, NotFoundError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";

import { TKmsCoreStore } from "../data-access/kms-core-store";
import { InstanceEncryptionKey } from "../model/instance-encryption-key";
import { KMS_ROOT_CONFIG_UUID, RootKeyConfig, RootKeyEncryptionStrategy } from "../model/root-key-config";
import { TKmsCoreState } from "./key-material";

const ABANDONED_ROTATION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

// How recent a superseded-key boot has to be for the expiring-key delete to treat it as a live straggler and ask
// the operator to confirm. Shorter than the GC's window: the GC has nobody to make that judgement.
const STRAGGLER_EVIDENCE_WINDOW_MS = 60 * 60 * 1000;

const HSM_ROTATION_REFUSED =
  "This instance wraps its root key with an HSM, so there is no environment variable to rotate. Rotate the key on the HSM itself, or switch the encryption strategy to software first.";
const ALREADY_STAGED =
  "A key is already staged. Deploy that key, discard it, or retry with replaceStaged=true to replace it.";

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

export type TRootKeyRotationServiceDeps = {
  runner: TTransactionRunner<TKmsCoreStore>;
  primary: TKmsCoreStore;
  state: TKmsCoreState;
  retentionDays: number;
  currentKekLabel: () => string | null;
  isFipsEnabled: () => boolean;
};

export class RootKeyRotationService {
  constructor(private readonly deps: TRootKeyRotationServiceDeps) {}

  async getRootKey(): Promise<TRootKeyStatus> {
    const { primary } = this.deps;
    const [active, stagedRows, retainedRows] = await Promise.all([
      primary.rootKeyConfigs.findById(KMS_ROOT_CONFIG_UUID),
      primary.rootKeyConfigs.findStaged(),
      primary.rootKeyConfigs.findRetained()
    ]);
    if (!active) throw new NotFoundError({ message: "KMS root config not found" });

    const [staged] = stagedRows;
    const [retained] = retainedRows;
    return {
      encryptionStrategy: active.strategy ?? null,
      active: {
        // The active row is the instance-wide answer; the in-memory label covers a row the boot backfill has not
        // labelled yet.
        label: active.kekLabel ?? this.deps.currentKekLabel(),
        activatedAt: active.activatedAt ?? active.createdAt
      },
      staged: staged ? { label: staged.kekLabel, createdAt: staged.createdAt } : null,
      expiring: retained?.supersededAt
        ? {
            label: retained.kekLabel,
            supersededAt: retained.supersededAt,
            lastResolvedAt: retained.lastResolvedAt,
            expiresAt: retained.removalEligibleAt(this.deps.retentionDays) as Date
          }
        : null
    };
  }

  async listRotations({ offset, limit }: { offset: number; limit: number }) {
    const { primary } = this.deps;
    const [rows, totalCount] = await Promise.all([
      primary.kekHistory.findPage({ offset, limit }),
      primary.kekHistory.count()
    ]);
    const rotations: TRotationHistoryEntry[] = rows.map((row) => ({
      label: row.kekLabel,
      activatedAt: row.activatedAt,
      supersededAt: row.supersededAt,
      retiredAt: row.retiredAt
    }));
    return { rotations, totalCount };
  }

  // Inert by design: the active key is untouched until a pod boots with the new value.
  async createRotation({ replaceStaged }: { replaceStaged?: boolean }): Promise<TCreatedRotation> {
    const { primary } = this.deps;
    const active = await primary.rootKeyConfigs.findById(KMS_ROOT_CONFIG_UUID);
    if (!active) throw new NotFoundError({ message: "KMS root config not found" });
    if (active.strategy === RootKeyEncryptionStrategy.HSM) throw new BadRequestError({ message: HSM_ROTATION_REFUSED });

    const existingStaged = await primary.rootKeyConfigs.findStaged();
    if (existingStaged.length && !replaceStaged) throw new BadRequestError({ message: ALREADY_STAGED });

    const result = await this.deps.runner.run(async ({ store }) => {
      await store.locks.rootKey();

      // Re-read under the lock: a strategy change to HSM holds the same lock.
      const activeNow = await store.rootKeyConfigs.findById(KMS_ROOT_CONFIG_UUID);
      if (!activeNow) throw new NotFoundError({ message: "KMS root config not found" });
      if (activeNow.strategy === RootKeyEncryptionStrategy.HSM)
        throw new BadRequestError({ message: HSM_ROTATION_REFUSED });

      // Read under the lock so the warning describes the key that will actually be removed on promotion.
      const [retained] = await store.rootKeyConfigs.findRetained();
      const stillStaged = await store.rootKeyConfigs.findStaged();
      if (stillStaged.length) {
        if (!replaceStaged) throw new BadRequestError({ message: ALREADY_STAGED });
        await store.rootKeyConfigs.deleteAllStaged();
      } else if (existingStaged.length) {
        // The key we set out to replace was applied while this request was in flight.
        throw new ConflictError({
          message:
            "The staged key was applied by a running instance while this request was in flight, so it cannot be replaced. There is no rollback once a rotation takes effect."
        });
      }

      const isFipsEnabled = this.deps.isFipsEnabled();
      const key = isFipsEnabled ? crypto.randomBytes(32).toString("base64") : crypto.randomBytes(16).toString("hex");
      const kek = InstanceEncryptionKey.fromRotationValue(key, isFipsEnabled);
      const encryptedRootKey = symmetricCipherService(SymmetricKeyAlgorithm.AES_GCM_256).encrypt(
        this.deps.state.rootKey.get(),
        kek.buffer
      );
      const row = await store.rootKeyConfigs.create(RootKeyConfig.stage({ encryptedRootKey, kekLabel: kek.label }));
      return { row, retained, key, label: kek.label };
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
    await this.deps.runner.run(async ({ store }) => {
      await store.locks.rootKey();
      const [staged] = await store.rootKeyConfigs.findStaged();
      if (!staged) throw new NotFoundError({ message: "There is no staged encryption key to discard." });

      if (staged.kekLabel !== label) {
        throw new ConflictError({
          message: staged.kekLabel
            ? `The staged encryption key is '${staged.kekLabel}', not '${label}'. Someone else staged a key after you loaded this page. Re-read the current state before discarding.`
            : "The staged encryption key carries no label to match against, so it cannot be named. Restart the instance to record one, then retry."
        });
      }

      if (!(await store.rootKeyConfigs.deleteById(staged.id))) {
        throw new ConflictError({
          message:
            "The key was applied by a running instance while this request was in flight, so it could not be discarded. There is no rollback once a rotation takes effect."
        });
      }
      logger.info(
        `Encryption key rotation discarded [rotationId=${staged.id}] [label=${staged.kekLabel ?? "unknown"}]`
      );
    });
  }

  async deleteExpiringKey({ label, force }: { label: string; force?: boolean }) {
    await this.deps.runner.run(async ({ store }) => {
      await store.locks.rootKey();
      const [retained] = await store.rootKeyConfigs.findRetained();
      if (!retained) throw new NotFoundError({ message: "There is no previous encryption key to remove." });

      if (retained.kekLabel !== label) {
        throw new ConflictError({
          message: retained.kekLabel
            ? `The previous encryption key is '${retained.kekLabel}', not '${label}'. Another rotation has taken effect since you loaded this page. Re-read the current state before removing it.`
            : "The previous encryption key carries no label to match against, so it cannot be named. Restart the instance to record one, then retry."
        });
      }

      // An instance that started on this key within the hour is very likely still running, and removing the key
      // would break its next restart. Nothing reports whether it rolled forward, so this asks the operator.
      const lastResolvedAt = retained.lastResolvedAt ? new Date(retained.lastResolvedAt).getTime() : null;
      if (lastResolvedAt && Date.now() - lastResolvedAt < STRAGGLER_EVIDENCE_WINDOW_MS) {
        if (!force) {
          throw new BadRequestError({
            message: `An instance started on the previous encryption key at ${new Date(
              lastResolvedAt
            ).toISOString()} and may still be running. It would fail to restart if the key were removed now. Roll that instance onto the current key first, or retry with force=true to remove the key anyway.`
          });
        }
        logger.warn(
          `Removing an encryption key an instance started on at ${new Date(lastResolvedAt).toISOString()}, forced by the caller [retainedKeyId=${retained.id}]`
        );
      }

      if (!(await RootKeyRotationService.retire(store, retained))) {
        throw new ConflictError({
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
    const { primary, retentionDays } = this.deps;
    const [retained, staged] = await Promise.all([
      primary.rootKeyConfigs.findRetained(),
      primary.rootKeyConfigs.findStaged()
    ]);

    const now = Date.now();
    const abandoned = staged.filter((row) => now - new Date(row.createdAt).getTime() >= ABANDONED_ROTATION_MAX_AGE_MS);
    for (const row of abandoned) {
      // eslint-disable-next-line no-await-in-loop -- at most one row in practice
      const removed = await this.deps.runner.run(async ({ store }) => {
        await store.locks.rootKey();
        // A pod may have promoted it, in which case it is the active key.
        const current = await store.rootKeyConfigs.findById(row.id);
        if (!current || current.activatedAt) return false;
        return store.rootKeyConfigs.deleteById(row.id);
      });
      if (removed) {
        logger.info(
          `Discarded an encryption key rotation that was never applied [rotationId=${row.id}] [label=${row.kekLabel ?? "unknown"}]`
        );
      }
    }

    if (!retained.length) return;

    // lastResolvedAt can only prove presence: a straggler that never restarts leaves no stamp, so the retention
    // window covers it. Getting it wrong costs an instance that fails its next restart naming the key it needs.
    const eligible = retained.filter((row) => (row.removalEligibleAt(retentionDays)?.getTime() ?? Infinity) <= now);
    for (const row of eligible) {
      // eslint-disable-next-line no-await-in-loop -- at most a couple of rows
      const removed = await this.deps.runner.run(async ({ store }) => {
        await store.locks.rootKey();
        const current = await store.rootKeyConfigs.findById(row.id);
        if (!current?.supersededAt) return false;
        if ((current.removalEligibleAt(retentionDays)?.getTime() ?? Infinity) > Date.now()) return false;
        return RootKeyRotationService.retire(store, current);
      });
      if (removed)
        logger.info(
          `Removed a superseded encryption key [retainedKeyId=${row.id}] [label=${row.kekLabel ?? "unknown"}]`
        );
    }

    for (const row of retained.filter((candidate) => !eligible.includes(candidate) && candidate.lastResolvedAt)) {
      logger.info(
        `Keeping the previous encryption key: an instance started on it at ${new Date(
          row.lastResolvedAt as Date
        ).toISOString()} [retainedKeyId=${row.id}]`
      );
    }
  }

  // False when the row was already gone, so a concurrent removal cannot report a deletion that did not happen.
  private static async retire(store: TKmsCoreStore, row: RootKeyConfig) {
    if (!(await store.rootKeyConfigs.deleteById(row.id))) return false;
    if (row.kekLabel) {
      const entry = await store.kekHistory.findActiveByLabel(row.kekLabel);
      if (entry) await store.kekHistory.markRetired(entry.id, new Date());
    }
    return true;
  }
}
