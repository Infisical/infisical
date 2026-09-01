/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName, TPkiSignerCertificateIssuanceJobs } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify } from "@app/lib/knex";

import { SignerIssuanceJobStatus } from "./signer-enums";

export type TSignerIssuanceJobDALFactory = ReturnType<typeof signerIssuanceJobDALFactory>;

export const signerIssuanceJobDALFactory = (db: TDbClient) => {
  const orm = ormify(db, TableName.PkiSignerCertificateIssuanceJobs);

  const findDuePending = async (now: Date, limit: number, tx?: Knex): Promise<TPkiSignerCertificateIssuanceJobs[]> => {
    try {
      return (await (tx || db.replicaNode())(TableName.PkiSignerCertificateIssuanceJobs)
        .where({ status: SignerIssuanceJobStatus.Pending })
        .andWhere("nextPollAt", "<=", now)
        .orderBy("nextPollAt", "asc")
        .limit(limit)) as TPkiSignerCertificateIssuanceJobs[];
    } catch (error) {
      throw new DatabaseError({ error, name: "FindDuePendingSignerIssuanceJobs" });
    }
  };

  const cancelOpenForSigner = async (signerId: string, reason: string, tx?: Knex) => {
    try {
      await (tx || db)(TableName.PkiSignerCertificateIssuanceJobs)
        .where({ signerId, status: SignerIssuanceJobStatus.Pending })
        .update({
          status: SignerIssuanceJobStatus.Failed,
          failureReason: reason.slice(0, 1000),
          updatedAt: new Date()
        } as Record<string, unknown>);
    } catch (error) {
      throw new DatabaseError({ error, name: "CancelOpenSignerIssuanceJobs" });
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
        .where({ id: jobId, status: SignerIssuanceJobStatus.Pending, attempts: expectedAttempts })
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

  return { ...orm, findDuePending, cancelOpenForSigner, claimForAttempt, findLatestForSigner };
};
