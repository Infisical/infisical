/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName, TPkiSignerCertificateIssuanceJobs } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify } from "@app/lib/knex";

import {
  POLLED_SIGNER_ISSUANCE_JOB_STATUSES,
  SignerIssuanceJobCancelReason,
  SignerIssuanceJobStatus
} from "./signer-enums";

export type TSignerIssuanceJobDALFactory = ReturnType<typeof signerIssuanceJobDALFactory>;

export const signerIssuanceJobDALFactory = (db: TDbClient) => {
  const orm = ormify(db, TableName.PkiSignerCertificateIssuanceJobs);

  const findDuePolled = async (now: Date, limit: number, tx?: Knex): Promise<TPkiSignerCertificateIssuanceJobs[]> => {
    try {
      return (await (tx || db.replicaNode())(TableName.PkiSignerCertificateIssuanceJobs)
        .whereIn("status", POLLED_SIGNER_ISSUANCE_JOB_STATUSES)
        .andWhere("nextPollAt", "<=", now)
        .orderBy("nextPollAt", "asc")
        .limit(limit)) as TPkiSignerCertificateIssuanceJobs[];
    } catch (error) {
      throw new DatabaseError({ error, name: "FindDuePendingSignerIssuanceJobs" });
    }
  };

  const findPendingForSignerForUpdate = async (
    signerId: string,
    tx: Knex
  ): Promise<TPkiSignerCertificateIssuanceJobs[]> => {
    try {
      return (await tx(TableName.PkiSignerCertificateIssuanceJobs)
        .where({ signerId, status: SignerIssuanceJobStatus.Pending })
        .forUpdate()) as TPkiSignerCertificateIssuanceJobs[];
    } catch (error) {
      throw new DatabaseError({ error, name: "FindPendingSignerIssuanceJobsForUpdate" });
    }
  };

  const closePending = async (
    {
      jobIds,
      status,
      cancelReason,
      reason
    }: {
      jobIds: string[];
      status: SignerIssuanceJobStatus.Cancelling | SignerIssuanceJobStatus.Cancelled;
      cancelReason: SignerIssuanceJobCancelReason;
      reason: string;
    },
    tx: Knex
  ) => {
    if (!jobIds.length) return;
    try {
      await tx(TableName.PkiSignerCertificateIssuanceJobs)
        .whereIn("id", jobIds)
        .where({ status: SignerIssuanceJobStatus.Pending })
        .update({
          status,
          cancelReason,
          failureReason: reason.slice(0, 1000),
          nextPollAt: new Date(),
          updatedAt: new Date()
        } as Record<string, unknown>);
    } catch (error) {
      throw new DatabaseError({ error, name: "ClosePendingSignerIssuanceJobs" });
    }
  };

  const completeIfPending = async (
    jobId: string,
    certificateId: string,
    tx?: Knex
  ): Promise<TPkiSignerCertificateIssuanceJobs | null> => {
    try {
      const [row] = await (tx || db)(TableName.PkiSignerCertificateIssuanceJobs)
        .where({ id: jobId, status: SignerIssuanceJobStatus.Pending })
        .update({
          status: SignerIssuanceJobStatus.Completed,
          certificateId,
          failureReason: null,
          updatedAt: new Date()
        } as Record<string, unknown>)
        .returning("*");
      return row ?? null;
    } catch (error) {
      throw new DatabaseError({ error, name: "CompleteSignerIssuanceJob" });
    }
  };

  const claimForAttempt = async (
    jobId: string,
    expectedAttempts: number,
    nextPollAt: Date,
    lastAttemptAt: Date,
    tx?: Knex
  ): Promise<TPkiSignerCertificateIssuanceJobs | null> => {
    try {
      const [row] = await (tx || db)(TableName.PkiSignerCertificateIssuanceJobs)
        .where({ id: jobId, attempts: expectedAttempts })
        .whereIn("status", POLLED_SIGNER_ISSUANCE_JOB_STATUSES)
        .update({
          attempts: expectedAttempts + 1,
          lastAttemptAt,
          nextPollAt,
          updatedAt: new Date()
        } as Record<string, unknown>)
        .returning("*");
      return row ?? null;
    } catch (error) {
      throw new DatabaseError({ error, name: "ClaimSignerIssuanceJobAttempt" });
    }
  };

  const findLatestForSigner = async (
    signerId: string,
    tx?: Knex
  ): Promise<TPkiSignerCertificateIssuanceJobs | undefined> => {
    try {
      return await (tx || db.replicaNode())(TableName.PkiSignerCertificateIssuanceJobs)
        .where({ signerId })
        .orderBy("createdAt", "desc")
        .first();
    } catch (error) {
      throw new DatabaseError({ error, name: "FindLatestSignerIssuanceJob" });
    }
  };

  return {
    ...orm,
    findDuePolled,
    findPendingForSignerForUpdate,
    closePending,
    completeIfPending,
    claimForAttempt,
    findLatestForSigner
  };
};
