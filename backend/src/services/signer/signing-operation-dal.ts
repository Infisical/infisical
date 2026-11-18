import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { AccessScope, TableName } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify, selectAllTableCols } from "@app/lib/knex";
import { fillActivityPeriods, getActivityPeriodWindow, selectActivityPeriod } from "@app/lib/knex/activity-periods";
import { ActorType } from "@app/services/auth/auth-type";

import { SigningOperationStatus } from "./signer-enums";

export type TSigningOperationDALFactory = ReturnType<typeof signingOperationDALFactory>;

export const signingOperationDALFactory = (db: TDbClient) => {
  const orm = ormify(db, TableName.PkiSigningOperations);

  const $withActorJoins = (tx?: Knex) =>
    (tx || db.replicaNode())(TableName.PkiSigningOperations)
      .leftJoin(TableName.Users, (qb) => {
        void qb
          .on(`${TableName.PkiSigningOperations}.actorId`, `${TableName.Users}.id`)
          .andOn(`${TableName.PkiSigningOperations}.actorType`, db.raw("?", [ActorType.USER]));
      })
      .leftJoin(TableName.Identity, (qb) => {
        void qb
          .on(`${TableName.PkiSigningOperations}.actorId`, `${TableName.Identity}.id`)
          .andOn(`${TableName.PkiSigningOperations}.actorType`, db.raw("?", [ActorType.IDENTITY]));
      })
      .leftJoin(TableName.Membership, (qb) => {
        void qb
          .on(`${TableName.Membership}.actorUserId`, `${TableName.Users}.id`)
          .andOn(`${TableName.Membership}.scopeProjectId`, `${TableName.PkiSigningOperations}.projectId`)
          .andOn(`${TableName.Membership}.scope`, db.raw("?", [AccessScope.Project]));
      })
      .select(selectAllTableCols(TableName.PkiSigningOperations))
      .select(
        db.ref("email").withSchema(TableName.Users).as("userEmail"),
        db.ref("username").withSchema(TableName.Users).as("userUsername"),
        db.ref("firstName").withSchema(TableName.Users).as("userFirstName"),
        db.ref("lastName").withSchema(TableName.Users).as("userLastName"),
        db.ref("name").withSchema(TableName.Identity).as("identityName"),
        db.ref("id").withSchema(TableName.Membership).as("membershipId")
      );

  const $mapActorRow = <T extends Record<string, unknown>>(row: T) => {
    const { userEmail, userUsername, userFirstName, userLastName, identityName, membershipId, ...op } =
      row as typeof row & {
        userEmail?: string | null;
        userUsername?: string | null;
        userFirstName?: string | null;
        userLastName?: string | null;
        identityName?: string | null;
        membershipId?: string | null;
        actorName?: string | null;
        actorType?: string;
      };

    let resolvedActorName: string | null = op.actorName ?? null;
    if (!resolvedActorName) {
      if (op.actorType === ActorType.USER) {
        if (userFirstName || userLastName) {
          resolvedActorName = [userFirstName, userLastName].filter(Boolean).join(" ");
        } else {
          resolvedActorName = userEmail || userUsername || null;
        }
      } else if (op.actorType === ActorType.IDENTITY) {
        resolvedActorName = identityName || null;
      }
    }

    return {
      ...op,
      actorName: resolvedActorName,
      actorMembershipId: membershipId ?? null
    };
  };

  const findBySignerId = async (
    signerId: string,
    {
      offset = 0,
      limit = 25,
      status
    }: {
      offset?: number;
      limit?: number;
      status?: SigningOperationStatus;
    },
    tx?: Knex
  ) => {
    try {
      let query = $withActorJoins(tx).where(`${TableName.PkiSigningOperations}.signerId`, signerId);

      if (status) {
        query = query.where(`${TableName.PkiSigningOperations}.status`, status);
      }

      const rows = await query
        .orderBy(`${TableName.PkiSigningOperations}.createdAt`, "desc")
        .offset(offset)
        .limit(limit);

      return rows.map($mapActorRow);
    } catch (error) {
      throw new DatabaseError({ error, name: "FindSigningOperationsBySignerId" });
    }
  };

  const findByIdWithActor = async (operationId: string, tx?: Knex) => {
    try {
      const row = await $withActorJoins(tx).where(`${TableName.PkiSigningOperations}.id`, operationId).first();
      return row ? $mapActorRow(row) : null;
    } catch (error) {
      throw new DatabaseError({ error, name: "FindSigningOperationByIdWithActor" });
    }
  };

  const countBySignerId = async (signerId: string, status?: SigningOperationStatus, tx?: Knex) => {
    try {
      let query = (tx || db.replicaNode())(TableName.PkiSigningOperations).where({ signerId });

      if (status) {
        query = query.where({ status });
      }

      const [result] = await query.count("* as count");
      return Number((result as unknown as { count: string | number }).count);
    } catch (error) {
      throw new DatabaseError({ error, name: "CountSigningOperationsBySignerId" });
    }
  };

  const PENDING_RESERVATION_WINDOW_MS = 5 * 60 * 1000;
  const countByGrantId = async (approvalGrantId: string, tx?: Knex) => {
    try {
      const cutoff = new Date(Date.now() - PENDING_RESERVATION_WINDOW_MS);
      const [result] = await (tx || db)(TableName.PkiSigningOperations)
        .where({ approvalGrantId })
        .andWhere((qb) => {
          void qb.where({ status: SigningOperationStatus.Success }).orWhere((p) => {
            void p.where({ status: SigningOperationStatus.Pending }).andWhere("createdAt", ">=", cutoff);
          });
        })
        .count("* as count");
      return Number((result as unknown as { count: string | number }).count);
    } catch (error) {
      throw new DatabaseError({ error, name: "CountSigningOperationsByGrantId" });
    }
  };

  const getActivityTrend = async (
    { projectId, signerIds, daysBack }: { projectId: string; signerIds?: string[]; daysBack: number },
    tx?: Knex
  ) => {
    try {
      const window = getActivityPeriodWindow(daysBack);
      const counts = new Map<string, { success: number; failed: number }>();

      if (!signerIds || signerIds.length) {
        let query = (tx || db.replicaNode())(TableName.PkiSigningOperations)
          .where(`${TableName.PkiSigningOperations}.projectId`, projectId)
          .where(`${TableName.PkiSigningOperations}.createdAt`, ">=", window.startDate)
          .where(`${TableName.PkiSigningOperations}.createdAt`, "<=", window.endDate);

        if (signerIds) {
          query = query.whereIn(`${TableName.PkiSigningOperations}.signerId`, signerIds);
        }

        const rows = (await query
          .select(
            selectActivityPeriod(db, window, TableName.PkiSigningOperations, "createdAt"),
            db.raw("count(*) filter (where status = ?)::int as success", [SigningOperationStatus.Success]),
            db.raw("count(*) filter (where status in (?, ?))::int as failed", [
              SigningOperationStatus.Failed,
              SigningOperationStatus.Denied
            ])
          )
          .groupBy("period")) as unknown as { period: string; success: number; failed: number }[];

        rows.forEach((row) => counts.set(row.period, { success: Number(row.success), failed: Number(row.failed) }));
      }

      return fillActivityPeriods(window, (period) => counts.get(period) ?? { success: 0, failed: 0 });
    } catch (error) {
      throw new DatabaseError({ error, name: "GetSigningOperationActivityTrend" });
    }
  };

  return { ...orm, findBySignerId, findByIdWithActor, countBySignerId, countByGrantId, getActivityTrend };
};
