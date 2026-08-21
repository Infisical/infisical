import { Knex } from "knex";

import { TKmsRootConfig } from "@app/db/schemas";
import { PgSqlLock } from "@app/keystore/keystore";
import { TEnvConfig } from "@app/lib/config/env";
import { CronJobName, TCronJobFactory } from "@app/lib/cron/cron-job";
import { crypto } from "@app/lib/crypto/cryptography";
import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { getKekFingerprint, KMS_ROOT_CONFIG_UUID } from "@app/services/kms/kms-fns";
import { TKmsKekHistoryDALFactory } from "@app/services/kms/kms-kek-history-dal";
import { TKmsRootConfigDALFactory } from "@app/services/kms/kms-root-config-dal";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { RootKeyEncryptionStrategy } from "@app/services/kms/kms-types";

import { generateRootEncryptionKey, resolveKekBuffer } from "./encryption-key-rotation-fns";
import {
  RotationBlocker,
  TCompleteRotationDTO,
  TCreatedRotation,
  TCreateRotationDTO,
  TEncryptionStatus
} from "./encryption-key-rotation-types";

const ABANDONED_ROTATION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

// How recent a superseded-key boot has to be for `complete` to treat it as a live straggler and ask the
// operator to confirm. Shorter than the GC's window on purpose: the GC is unattended and has nobody to
// make that judgement, whereas an operator calling `complete` can look at their fleet.
const STRAGGLER_EVIDENCE_WINDOW_MS = 60 * 60 * 1000; // 1 hour

type TEncryptionKeyRotationServiceFactoryDep = {
  kmsService: Pick<TKmsServiceFactory, "encryptRootKeyForKek" | "getCurrentKekFingerprint">;
  kmsRootConfigDAL: Pick<
    TKmsRootConfigDALFactory,
    | "findById"
    | "findAll"
    | "findPending"
    | "findRetained"
    | "create"
    | "deleteById"
    | "deleteAllPending"
    | "transaction"
  >;
  kmsKekHistoryDAL: Pick<TKmsKekHistoryDALFactory, "findHistory" | "findCurrent" | "updateById">;
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
  const getStatus = async (): Promise<TEncryptionStatus> => {
    const [sentinel, pendingRows, retainedRows, history] = await Promise.all([
      kmsRootConfigDAL.findById(KMS_ROOT_CONFIG_UUID),
      kmsRootConfigDAL.findPending(),
      kmsRootConfigDAL.findRetained(),
      kmsKekHistoryDAL.findHistory()
    ]);

    // No both-variables-set blocker: a rotation always targets ENCRYPTION_KEY, which
    // $getBasicEncryptionKey always resolves in preference to anything else, so it takes effect
    // regardless of what else the environment holds.
    const blockers: RotationBlocker[] = [];
    if (sentinel?.encryptionStrategy === RootKeyEncryptionStrategy.HSM) blockers.push(RotationBlocker.HsmStrategy);
    if (pendingRows.length) blockers.push(RotationBlocker.RotationPending);

    const [retained] = retainedRows;

    return {
      activeFingerprint: kmsService.getCurrentKekFingerprint(),
      encryptionStrategy: sentinel?.encryptionStrategy ?? null,
      pendingRotation: pendingRows[0]
        ? {
            id: pendingRows[0].id,
            createdAt: pendingRows[0].createdAt,
            fingerprint: pendingRows[0].kekFingerprint ?? null
          }
        : null,
      retainedKey: retained
        ? {
            id: retained.id,
            supersededAt: retained.supersededAt as Date,
            lastResolvedAt: retained.lastResolvedAt ?? null,
            fingerprint: retained.kekFingerprint ?? null
          }
        : null,
      history: history.map(({ kekFingerprint, activatedAt, supersededAt, retiredAt }) => ({
        kekFingerprint,
        activatedAt,
        supersededAt,
        retiredAt
      })),
      blockers
    };
  };

  /** Inert by design: the active key is untouched until a pod boots with the new value. */
  const createRotation = async ({ supersede }: TCreateRotationDTO): Promise<TCreatedRotation> => {
    const sentinel = await kmsRootConfigDAL.findById(KMS_ROOT_CONFIG_UUID);
    if (!sentinel) throw new NotFoundError({ message: "KMS root config not found" });

    if (sentinel.encryptionStrategy === RootKeyEncryptionStrategy.HSM) {
      throw new BadRequestError({
        message:
          "This instance wraps its root key with an HSM, so there is no environment variable to rotate. Rotate the key on the HSM itself, or switch the encryption strategy to software first."
      });
    }

    const existingPending = await kmsRootConfigDAL.findPending();
    if (existingPending.length && !supersede) {
      throw new BadRequestError({
        message: "A rotation is already pending. Deploy that key, discard it, or retry with supersede to replace it."
      });
    }

    const isFipsEnabled = crypto.isFipsModeEnabled();
    const key = generateRootEncryptionKey(isFipsEnabled);
    const kekBuffer = resolveKekBuffer(key, isFipsEnabled);
    const encryptedRootKey = kmsService.encryptRootKeyForKek(kekBuffer);
    const fingerprint = getKekFingerprint(kekBuffer);

    const pending = await kmsRootConfigDAL.transaction(async (tx) => {
      await tx.raw("SELECT pg_advisory_xact_lock(?)", [PgSqlLock.KmsRootKeyInit]);

      const stillPending = await kmsRootConfigDAL.findPending(tx);
      if (stillPending.length) {
        if (!supersede) {
          throw new BadRequestError({
            message:
              "A rotation is already pending. Deploy that key, discard it, or retry with supersede to replace it."
          });
        }
        await kmsRootConfigDAL.deleteAllPending(tx);
      } else if (existingPending.length) {
        // We set out to replace a staged key and it is no longer staged, so an instance applied it while
        // this request was in flight. Reporting it replaced would tell the operator a live key was retired.
        throw new BadRequestError({
          message:
            "The pending key was applied by a running instance while this request was in flight, so it cannot be replaced. There is no rollback once a rotation takes effect."
        });
      }

      return kmsRootConfigDAL.create(
        {
          encryptedRootKey,
          encryptionStrategy: RootKeyEncryptionStrategy.Software,
          kekFingerprint: fingerprint,
          activatedAt: null
        },
        tx
      );
    });

    logger.info(`Encryption key rotation staged [rotationId=${pending.id}] [fingerprint=${fingerprint}]`);

    return { id: pending.id, fingerprint, key };
  };

  /**
   * Removes a retained key and records it as retired, inside a transaction the caller has already locked.
   * Returns false when the row was already gone, so a concurrent completion or GC pass cannot report a
   * deletion that did not happen.
   */
  const $retireRetainedKey = async (tx: Knex, row: TKmsRootConfig) => {
    const deleted = await kmsRootConfigDAL.deleteById(row.id, tx);
    if (!deleted) return false;

    if (row.kekFingerprint) {
      const history = await kmsKekHistoryDAL.findHistory(tx);
      const entry = history.find((e) => e.kekFingerprint === row.kekFingerprint && !e.retiredAt);
      if (entry) await kmsKekHistoryDAL.updateById(entry.id, { retiredAt: new Date() }, tx);
    }

    return true;
  };

  const discardRotation = async (rotationId: string) => {
    return kmsRootConfigDAL.transaction(async (tx) => {
      await tx.raw("SELECT pg_advisory_xact_lock(?)", [PgSqlLock.KmsRootKeyInit]);

      const row = await kmsRootConfigDAL.findById(rotationId, tx);
      if (!row || row.id === KMS_ROOT_CONFIG_UUID) {
        throw new NotFoundError({ message: `Pending encryption key rotation with ID '${rotationId}' not found` });
      }
      if (row.activatedAt) {
        throw new BadRequestError({
          message:
            "That rotation has already been applied by a running instance and cannot be discarded. There is no rollback once a rotation takes effect."
        });
      }

      const deleted = await kmsRootConfigDAL.deleteById(rotationId, tx);
      if (!deleted) {
        throw new BadRequestError({
          message:
            "The key was applied by a running instance while this request was in flight, so it could not be discarded. There is no rollback once a rotation takes effect."
        });
      }

      logger.info(
        `Encryption key rotation discarded [rotationId=${rotationId}] [fingerprint=${row.kekFingerprint ?? "unknown"}]`
      );
      return { fingerprint: row.kekFingerprint ?? null };
    });
  };

  const completeRotation = async ({ rotationId, acknowledged }: TCompleteRotationDTO) => {
    return kmsRootConfigDAL.transaction(async (tx) => {
      await tx.raw("SELECT pg_advisory_xact_lock(?)", [PgSqlLock.KmsRootKeyInit]);

      const row = await kmsRootConfigDAL.findById(rotationId, tx);
      if (!row || row.id === KMS_ROOT_CONFIG_UUID || !row.supersededAt) {
        throw new NotFoundError({ message: `Retained encryption key with ID '${rotationId}' not found` });
      }

      // An instance that started on this key within the hour is very likely still running, and removing
      // the key would break its next restart. Nothing reports whether it has since rolled forward, so
      // this asks the operator rather than refusing outright.
      const lastResolvedAt = row.lastResolvedAt ? new Date(row.lastResolvedAt).getTime() : null;
      if (lastResolvedAt && Date.now() - lastResolvedAt < STRAGGLER_EVIDENCE_WINDOW_MS) {
        if (!acknowledged) {
          throw new BadRequestError({
            message: `An instance started on the previous encryption key at ${new Date(
              lastResolvedAt
            ).toISOString()} and may still be running. It would fail to restart if the key were removed now. Roll that instance onto the current key first, or acknowledge this to remove the key anyway.`
          });
        }

        logger.warn(
          `Removing an encryption key an instance started on at ${new Date(
            lastResolvedAt
          ).toISOString()}, acknowledged by the caller [retainedKeyId=${rotationId}]`
        );
      }

      if (!(await $retireRetainedKey(tx, row))) {
        throw new BadRequestError({
          message: "The previous encryption key was already removed while this request was in flight."
        });
      }

      logger.info(`Encryption key rotation completed, previous key removed [retainedKeyId=${rotationId}]`);
      return { retiredFingerprint: row.kekFingerprint ?? null };
    });
  };

  const $runGarbageCollection = async () => {
    const [retained, pending] = await Promise.all([kmsRootConfigDAL.findRetained(), kmsRootConfigDAL.findPending()]);

    // Supersede caps pending at one, so this is for the admin who generated a key and walked away.
    const now = Date.now();
    const abandoned = pending.filter((row) => now - new Date(row.createdAt).getTime() >= ABANDONED_ROTATION_MAX_AGE_MS);
    for (const row of abandoned) {
      // eslint-disable-next-line no-await-in-loop -- at most one row in practice
      const removed = await kmsRootConfigDAL.transaction(async (tx) => {
        await tx.raw("SELECT pg_advisory_xact_lock(?)", [PgSqlLock.KmsRootKeyInit]);
        // Re-read: a pod may have promoted it, in which case it is the active key and must not be deleted.
        const current = await kmsRootConfigDAL.findById(row.id, tx);
        if (!current || current.activatedAt) return false;
        return Boolean(await kmsRootConfigDAL.deleteById(row.id, tx));
      });
      if (removed) logger.info(`Discarded an encryption key rotation that was never applied [rotationId=${row.id}]`);
    }

    if (!retained.length) return;

    const retentionMs = envConfig.KMS_ROOT_KEY_RETENTION_DAYS * 24 * 60 * 60 * 1000;

    // Only the newest copy gets the retention window: it is the only key a lost new key can fall back
    // to. Older ones go as soon as nothing has been seen using them, which caps the table at three rows.
    //
    // lastResolvedAt is the only liveness signal there is, and it can only prove presence. A straggler
    // that never restarts leaves no stamp, so the retention window is what covers it. That is the
    // deliberate limit of this design: the cost of getting it wrong is an instance that fails its next
    // restart with an error naming the key it needs, not lost data.
    const eligible = retained.filter((row, index) => {
      const resolvedRecently = row.lastResolvedAt && now - new Date(row.lastResolvedAt).getTime() < retentionMs;
      if (resolvedRecently) return false;
      return index > 0 || now - new Date(row.supersededAt as Date).getTime() >= retentionMs;
    });

    for (const row of eligible) {
      // eslint-disable-next-line no-await-in-loop -- at most a couple of rows
      const removed = await kmsRootConfigDAL.transaction(async (tx) => {
        await tx.raw("SELECT pg_advisory_xact_lock(?)", [PgSqlLock.KmsRootKeyInit]);
        const current = await kmsRootConfigDAL.findById(row.id, tx);
        if (!current || !current.supersededAt) return false;
        return $retireRetainedKey(tx, current);
      });
      if (removed) logger.info(`Removed a superseded encryption key [retainedKeyId=${row.id}]`);
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
      handler: $runGarbageCollection
    });
  };

  return { init, getStatus, createRotation, discardRotation, completeRotation };
};
