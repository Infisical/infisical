import { Knex } from "knex";

import { TKmsRootConfig } from "@app/db/schemas";
import { PgSqlLock } from "@app/keystore/keystore";
import { TEnvConfig } from "@app/lib/config/env";
import { CronJobName, TCronJobFactory } from "@app/lib/cron/cron-job";
import { crypto } from "@app/lib/crypto/cryptography";
import { BadRequestError, ConflictError, NotFoundError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { getKekLabel, KMS_ROOT_CONFIG_UUID } from "@app/services/kms/kms-fns";
import { TKmsKekHistoryDALFactory } from "@app/services/kms/kms-kek-history-dal";
import { TKmsRootConfigDALFactory } from "@app/services/kms/kms-root-config-dal";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { RootKeyEncryptionStrategy } from "@app/services/kms/kms-types";

import { generateRootEncryptionKey, resolveKekBuffer } from "./encryption-key-rotation-fns";
import {
  TCreatedRotation,
  TCreateRotationDTO,
  TDeleteExpiringKeyDTO,
  TDeleteStagedKeyDTO,
  TListRotationsDTO,
  TRootKeyStatus,
  TRotationHistoryEntry
} from "./encryption-key-rotation-types";

const ABANDONED_ROTATION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

// How recent a superseded-key boot has to be for the expiring-key delete to treat it as a live straggler
// and ask the operator to confirm. Shorter than the GC's window on purpose: the GC is unattended and has
// nobody to make that judgement, whereas an operator removing the key can look at their fleet.
const STRAGGLER_EVIDENCE_WINDOW_MS = 60 * 60 * 1000; // 1 hour

type TEncryptionKeyRotationServiceFactoryDep = {
  kmsService: Pick<TKmsServiceFactory, "encryptRootKeyForKek" | "getCurrentKekLabel">;
  kmsRootConfigDAL: Pick<
    TKmsRootConfigDALFactory,
    "findById" | "findAll" | "findStaged" | "findRetained" | "create" | "deleteById" | "deleteAllStaged" | "transaction"
  >;
  kmsKekHistoryDAL: Pick<
    TKmsKekHistoryDALFactory,
    "findHistoryPage" | "findActiveByLabel" | "findCurrent" | "updateById" | "countDocuments"
  >;
  envConfig: Pick<TEnvConfig, "KMS_ROOT_KEY_RETENTION_DAYS">;
  cronJob: TCronJobFactory;
};

export type TEncryptionKeyRotationServiceFactory = ReturnType<typeof encryptionKeyRotationServiceFactory>;

export const encryptionKeyRotationServiceFactory = ({
  kmsService,
  kmsRootConfigDAL,
  kmsKekHistoryDAL,
  envConfig,
  cronJob
}: TEncryptionKeyRotationServiceFactoryDep) => {
  const getRootKey = async (): Promise<TRootKeyStatus> => {
    const [sentinel, stagedRows, retainedRows] = await Promise.all([
      kmsRootConfigDAL.findById(KMS_ROOT_CONFIG_UUID),
      kmsRootConfigDAL.findStaged(),
      kmsRootConfigDAL.findRetained()
    ]);

    if (!sentinel) throw new NotFoundError({ message: "KMS root config not found" });

    const [staged] = stagedRows;
    const [retained] = retainedRows;

    return {
      encryptionStrategy: sentinel.encryptionStrategy ?? null,
      active: {
        // The sentinel is the instance-wide answer. During a rolling restart the pod serving this
        // request may still be on the older key, and reporting that would describe the pod, not the
        // instance. The in-memory label is the fallback for a row the boot backfill has not labelled.
        label: sentinel.kekLabel ?? kmsService.getCurrentKekLabel(),
        activatedAt: sentinel.activatedAt ?? sentinel.createdAt
      },
      staged: staged ? { label: staged.kekLabel ?? null, createdAt: staged.createdAt } : null,
      expiring: retained
        ? {
            label: retained.kekLabel ?? null,
            supersededAt: retained.supersededAt as Date,
            lastResolvedAt: retained.lastResolvedAt ?? null
          }
        : null
    };
  };

  const listRotations = async ({
    offset,
    limit
  }: TListRotationsDTO): Promise<{ rotations: TRotationHistoryEntry[]; totalCount: number }> => {
    const [rows, totalCount] = await Promise.all([
      kmsKekHistoryDAL.findHistoryPage({ offset, limit }),
      kmsKekHistoryDAL.countDocuments()
    ]);

    return {
      rotations: rows.map(({ kekLabel, activatedAt, supersededAt, retiredAt }) => ({
        label: kekLabel,
        activatedAt,
        supersededAt: supersededAt ?? null,
        retiredAt: retiredAt ?? null
      })),
      totalCount
    };
  };

  /** Inert by design: the active key is untouched until a pod boots with the new value. */
  const createRotation = async ({ replaceStaged }: TCreateRotationDTO): Promise<TCreatedRotation> => {
    const sentinel = await kmsRootConfigDAL.findById(KMS_ROOT_CONFIG_UUID);
    if (!sentinel) throw new NotFoundError({ message: "KMS root config not found" });

    if (sentinel.encryptionStrategy === RootKeyEncryptionStrategy.HSM) {
      throw new BadRequestError({
        message:
          "This instance wraps its root key with an HSM, so there is no environment variable to rotate. Rotate the key on the HSM itself, or switch the encryption strategy to software first."
      });
    }

    const existingStaged = await kmsRootConfigDAL.findStaged();
    if (existingStaged.length && !replaceStaged) {
      throw new BadRequestError({
        message: "A key is already staged. Deploy that key, discard it, or retry with replaceStaged=true to replace it."
      });
    }

    const result = await kmsRootConfigDAL.transaction(async (tx) => {
      await tx.raw("SELECT pg_advisory_xact_lock(?)", [PgSqlLock.KmsRootKeyInit]);

      // Read under the lock so the warning describes the key that will actually be removed on promotion.
      const [retained] = await kmsRootConfigDAL.findRetained(tx);

      const stillStaged = await kmsRootConfigDAL.findStaged(tx);
      if (stillStaged.length) {
        if (!replaceStaged) {
          throw new BadRequestError({
            message:
              "A key is already staged. Deploy that key, discard it, or retry with replaceStaged=true to replace it."
          });
        }
        await kmsRootConfigDAL.deleteAllStaged(tx);
      } else if (existingStaged.length) {
        // We set out to replace a staged key and it is no longer staged, so an instance applied it while
        // this request was in flight. Reporting it replaced would tell the operator a live key was retired.
        throw new ConflictError({
          message:
            "The staged key was applied by a running instance while this request was in flight, so it cannot be replaced. There is no rollback once a rotation takes effect."
        });
      }

      const isFipsEnabled = crypto.isFipsModeEnabled();
      const key = generateRootEncryptionKey(isFipsEnabled);
      const kekBuffer = resolveKekBuffer(key, isFipsEnabled);
      const label = getKekLabel(kekBuffer);

      const row = await kmsRootConfigDAL.create(
        {
          encryptedRootKey: kmsService.encryptRootKeyForKek(kekBuffer),
          encryptionStrategy: RootKeyEncryptionStrategy.Software,
          kekLabel: label,
          activatedAt: null
        },
        tx
      );

      return { row, retained, key, label };
    });

    logger.info(`Encryption key rotation staged [rotationId=${result.row.id}] [label=${result.label}]`);

    return {
      label: result.label,
      key: result.key,
      ...(result.retained
        ? {
            removesExpiringKey: {
              label: result.retained.kekLabel ?? null,
              lastResolvedAt: result.retained.lastResolvedAt ?? null
            }
          }
        : {})
    };
  };

  /**
   * Removes a retained key and records it as retired, inside a transaction the caller has already locked.
   * Returns false when the row was already gone, so a concurrent removal or GC pass cannot report a
   * deletion that did not happen.
   */
  const $retireRetainedKey = async (tx: Knex, row: TKmsRootConfig) => {
    const deleted = await kmsRootConfigDAL.deleteById(row.id, tx);
    if (!deleted) return false;

    if (row.kekLabel) {
      const entry = await kmsKekHistoryDAL.findActiveByLabel(row.kekLabel, tx);
      if (entry) await kmsKekHistoryDAL.updateById(entry.id, { retiredAt: new Date() }, tx);
    }

    return true;
  };

  const deleteStagedKey = async ({ label }: TDeleteStagedKeyDTO) => {
    return kmsRootConfigDAL.transaction(async (tx) => {
      await tx.raw("SELECT pg_advisory_xact_lock(?)", [PgSqlLock.KmsRootKeyInit]);

      const [staged] = await kmsRootConfigDAL.findStaged(tx);
      if (!staged) {
        throw new NotFoundError({
          message: "There is no staged encryption key to discard."
        });
      }

      if (staged.kekLabel !== label) {
        throw new ConflictError({
          message: staged.kekLabel
            ? `The staged encryption key is '${staged.kekLabel}', not '${label}'. Someone else staged a key after you loaded this page. Re-read the current state before discarding.`
            : "The staged encryption key carries no label to match against, so it cannot be named. Restart the instance to record one, then retry."
        });
      }

      const deleted = await kmsRootConfigDAL.deleteById(staged.id, tx);
      if (!deleted) {
        throw new ConflictError({
          message:
            "The key was applied by a running instance while this request was in flight, so it could not be discarded. There is no rollback once a rotation takes effect."
        });
      }

      logger.info(
        `Encryption key rotation discarded [rotationId=${staged.id}] [label=${staged.kekLabel ?? "unknown"}]`
      );
    });
  };

  const deleteExpiringKey = async ({ label, force }: TDeleteExpiringKeyDTO) => {
    return kmsRootConfigDAL.transaction(async (tx) => {
      await tx.raw("SELECT pg_advisory_xact_lock(?)", [PgSqlLock.KmsRootKeyInit]);

      const [retained] = await kmsRootConfigDAL.findRetained(tx);
      if (!retained) {
        throw new NotFoundError({ message: "There is no previous encryption key to remove." });
      }

      if (retained.kekLabel !== label) {
        throw new ConflictError({
          message: retained.kekLabel
            ? `The previous encryption key is '${retained.kekLabel}', not '${label}'. Another rotation has taken effect since you loaded this page. Re-read the current state before removing it.`
            : "The previous encryption key carries no label to match against, so it cannot be named. Restart the instance to record one, then retry."
        });
      }

      // An instance that started on this key within the hour is very likely still running, and removing
      // the key would break its next restart. Nothing reports whether it has since rolled forward, so
      // this asks the operator rather than refusing outright.
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
          `Removing an encryption key an instance started on at ${new Date(
            lastResolvedAt
          ).toISOString()}, forced by the caller [retainedKeyId=${retained.id}]`
        );
      }

      if (!(await $retireRetainedKey(tx, retained))) {
        throw new ConflictError({
          message: "The previous encryption key was already removed while this request was in flight."
        });
      }

      logger.info(
        `Encryption key rotation completed, previous key removed [retainedKeyId=${retained.id}] [label=${retained.kekLabel ?? "unknown"}]`
      );
    });
  };

  const runGarbageCollection = async () => {
    const [retained, staged] = await Promise.all([kmsRootConfigDAL.findRetained(), kmsRootConfigDAL.findStaged()]);

    // replaceStaged caps staged keys at one, so this is for the admin who generated a key and walked away.
    const now = Date.now();
    const abandoned = staged.filter((row) => now - new Date(row.createdAt).getTime() >= ABANDONED_ROTATION_MAX_AGE_MS);
    for (const row of abandoned) {
      // eslint-disable-next-line no-await-in-loop -- at most one row in practice
      const removed = await kmsRootConfigDAL.transaction(async (tx) => {
        await tx.raw("SELECT pg_advisory_xact_lock(?)", [PgSqlLock.KmsRootKeyInit]);
        // Re-read: a pod may have promoted it, in which case it is the active key and must not be deleted.
        const current = await kmsRootConfigDAL.findById(row.id, tx);
        if (!current || current.activatedAt) return false;
        return Boolean(await kmsRootConfigDAL.deleteById(row.id, tx));
      });
      if (removed)
        logger.info(
          `Discarded an encryption key rotation that was never applied [rotationId=${row.id}] [label=${row.kekLabel ?? "unknown"}]`
        );
    }

    if (!retained.length) return;

    const retentionMs = envConfig.KMS_ROOT_KEY_RETENTION_DAYS * 24 * 60 * 60 * 1000;

    // Promotion leaves exactly one retained key, so there is only ever one row to consider here.
    //
    // lastResolvedAt is the only liveness signal there is, and it can only prove presence. A straggler
    // that never restarts leaves no stamp, so the retention window is what covers it. That is the
    // deliberate limit of this design: the cost of getting it wrong is an instance that fails its next
    // restart with an error naming the key it needs, not lost data.
    const eligible = retained.filter(
      (row) =>
        !(row.lastResolvedAt && now - new Date(row.lastResolvedAt).getTime() < retentionMs) &&
        now - new Date(row.supersededAt as Date).getTime() >= retentionMs
    );

    for (const row of eligible) {
      // eslint-disable-next-line no-await-in-loop -- at most a couple of rows
      const removed = await kmsRootConfigDAL.transaction(async (tx) => {
        await tx.raw("SELECT pg_advisory_xact_lock(?)", [PgSqlLock.KmsRootKeyInit]);
        const current = await kmsRootConfigDAL.findById(row.id, tx);
        if (!current || !current.supersededAt) return false;
        if (current.lastResolvedAt && Date.now() - new Date(current.lastResolvedAt).getTime() < retentionMs)
          return false;
        return $retireRetainedKey(tx, current);
      });
      if (removed)
        logger.info(
          `Removed a superseded encryption key [retainedKeyId=${row.id}] [label=${row.kekLabel ?? "unknown"}]`
        );
    }

    const kept = retained.filter((row) => !eligible.includes(row) && row.lastResolvedAt);
    for (const row of kept) {
      logger.info(
        `Keeping the previous encryption key: an instance started on it at ${new Date(
          row.lastResolvedAt as Date
        ).toISOString()} [retainedKeyId=${row.id}]`
      );
    }
  };

  const init = () => {
    cronJob.register({
      name: CronJobName.KmsRootKeyCleanup,
      pattern: "0 3 * * 0",
      runHashTtlS: 60 * 60,
      handler: runGarbageCollection
    });
  };

  return {
    init,
    getRootKey,
    listRotations,
    createRotation,
    deleteStagedKey,
    deleteExpiringKey,
    runGarbageCollection
  };
};
