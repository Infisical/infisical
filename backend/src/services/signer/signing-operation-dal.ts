import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { AccessScope, TableName } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify, selectAllTableCols } from "@app/lib/knex";
import { ActorType } from "@app/services/auth/auth-type";

import { SigningOperationStatus } from "./signer-enums";

export type TSigningOperationDALFactory = ReturnType<typeof signingOperationDALFactory>;

export const signingOperationDALFactory = (db: TDbClient) => {
  const orm = ormify(db, TableName.SigningOperations);

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
      let query = (tx || db.replicaNode())(TableName.SigningOperations)
        .where(`${TableName.SigningOperations}.signerId`, signerId)
        .leftJoin(TableName.Users, (qb) => {
          void qb
            .on(`${TableName.SigningOperations}.actorId`, `${TableName.Users}.id`)
            .andOn(`${TableName.SigningOperations}.actorType`, db.raw("?", [ActorType.USER]));
        })
        .leftJoin(TableName.Identity, (qb) => {
          void qb
            .on(`${TableName.SigningOperations}.actorId`, `${TableName.Identity}.id`)
            .andOn(`${TableName.SigningOperations}.actorType`, db.raw("?", [ActorType.IDENTITY]));
        })
        .leftJoin(TableName.Membership, (qb) => {
          void qb
            .on(`${TableName.Membership}.actorUserId`, `${TableName.Users}.id`)
            .andOn(`${TableName.Membership}.scopeProjectId`, `${TableName.SigningOperations}.projectId`)
            .andOn(`${TableName.Membership}.scope`, db.raw("?", [AccessScope.Project]));
        })
        .select(selectAllTableCols(TableName.SigningOperations))
        .select(
          db.ref("email").withSchema(TableName.Users).as("userEmail"),
          db.ref("username").withSchema(TableName.Users).as("userUsername"),
          db.ref("firstName").withSchema(TableName.Users).as("userFirstName"),
          db.ref("lastName").withSchema(TableName.Users).as("userLastName"),
          db.ref("name").withSchema(TableName.Identity).as("identityName"),
          db.ref("id").withSchema(TableName.Membership).as("membershipId")
        );

      if (status) {
        query = query.where(`${TableName.SigningOperations}.status`, status);
      }

      const rows = await query.orderBy(`${TableName.SigningOperations}.createdAt`, "desc").offset(offset).limit(limit);

      return rows.map((row) => {
        const { userEmail, userUsername, userFirstName, userLastName, identityName, membershipId, ...op } =
          row as typeof row & {
            userEmail?: string | null;
            userUsername?: string | null;
            userFirstName?: string | null;
            userLastName?: string | null;
            identityName?: string | null;
            membershipId?: string | null;
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
      });
    } catch (error) {
      throw new DatabaseError({ error, name: "FindSigningOperationsBySignerId" });
    }
  };

  const countBySignerId = async (signerId: string, status?: SigningOperationStatus, tx?: Knex) => {
    try {
      let query = (tx || db.replicaNode())(TableName.SigningOperations).where({ signerId });

      if (status) {
        query = query.where({ status });
      }

      const [result] = await query.count("* as count");
      return Number((result as unknown as { count: string | number }).count);
    } catch (error) {
      throw new DatabaseError({ error, name: "CountSigningOperationsBySignerId" });
    }
  };

  const countByGrantId = async (approvalGrantId: string, tx?: Knex) => {
    try {
      const [result] = await (tx || db)(TableName.SigningOperations)
        .where({ approvalGrantId, status: SigningOperationStatus.Success })
        .count("* as count");
      return Number((result as unknown as { count: string | number }).count);
    } catch (error) {
      throw new DatabaseError({ error, name: "CountSigningOperationsByGrantId" });
    }
  };

  return { ...orm, findBySignerId, countBySignerId, countByGrantId };
};
