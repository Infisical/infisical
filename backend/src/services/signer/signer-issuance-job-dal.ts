/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName, TPkiSignerIssuanceJobs } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify } from "@app/lib/knex";

import { SignerIssuanceJobStatus } from "./signer-enums";

export type TSignerIssuanceJobDALFactory = ReturnType<typeof signerIssuanceJobDALFactory>;

export const signerIssuanceJobDALFactory = (db: TDbClient) => {
  const orm = ormify(db, TableName.PkiSignerIssuanceJobs);

  const findDuePending = async (now: Date, limit: number, tx?: Knex): Promise<TPkiSignerIssuanceJobs[]> => {
    try {
      return (await (tx || db.replicaNode())(TableName.PkiSignerIssuanceJobs)
        .where({ status: SignerIssuanceJobStatus.Pending })
        .andWhere("nextPollAt", "<=", now)
        .orderBy("nextPollAt", "asc")
        .limit(limit)) as TPkiSignerIssuanceJobs[];
    } catch (error) {
      throw new DatabaseError({ error, name: "FindDuePendingSignerIssuanceJobs" });
    }
  };

  const cancelOpenForSigner = async (signerId: string, reason: string, tx?: Knex) => {
    try {
      await (tx || db)(TableName.PkiSignerIssuanceJobs)
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
  ): Promise<TPkiSignerIssuanceJobs | null> => {
    try {
      const [row] = await (tx || db)(TableName.PkiSignerIssuanceJobs)
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

  return { ...orm, findDuePending, cancelOpenForSigner, claimForAttempt };
};
