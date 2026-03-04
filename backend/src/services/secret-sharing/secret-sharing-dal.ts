import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName, TSecretSharing } from "@app/db/schemas";
import { DatabaseError, NotFoundError } from "@app/lib/errors";
import { ormify, selectAllTableCols } from "@app/lib/knex";
import { logger } from "@app/lib/logger";
import { QueueName } from "@app/queue";

import { SecretSharingType } from "./secret-sharing-types";

export type TSecretSharingDALFactory = ReturnType<typeof secretSharingDALFactory>;

export const secretSharingDALFactory = (db: TDbClient) => {
  const sharedSecretOrm = ormify(db, TableName.SecretSharing);

  const getSecretRequestById = async (id: string) => {
    const repDb = db.replicaNode();

    const secretRequest = await repDb(TableName.SecretSharing)
      .leftJoin(TableName.Organization, `${TableName.Organization}.id`, `${TableName.SecretSharing}.orgId`)
      .leftJoin(TableName.Users, `${TableName.Users}.id`, `${TableName.SecretSharing}.userId`)
      .where(`${TableName.SecretSharing}.id`, id)
      .where(`${TableName.SecretSharing}.type`, SecretSharingType.Request)
      .select(
        repDb.ref("name").withSchema(TableName.Organization).as("orgName"),
        repDb.ref("firstName").withSchema(TableName.Users).as("requesterFirstName"),
        repDb.ref("lastName").withSchema(TableName.Users).as("requesterLastName"),
        repDb.ref("username").withSchema(TableName.Users).as("requesterUsername")
      )
      .select(selectAllTableCols(TableName.SecretSharing))
      .first();

    if (!secretRequest) {
      throw new NotFoundError({
        message: `Secret request with ID '${id}' not found`
      });
    }

    return {
      ...secretRequest,
      requester: {
        organizationName: secretRequest.orgName,
        firstName: secretRequest.requesterFirstName,
        lastName: secretRequest.requesterLastName,
        username: secretRequest.requesterUsername
      }
    };
  };

  const countAllUserOrgSharedSecrets = async ({
    orgId,
    type,
    ...actorFilters
  }: {
    orgId: string;
    type: SecretSharingType;
    userId?: string;
    identityId?: string;
  }) => {
    try {
      interface CountResult {
        count: string;
      }

      const count = await db
        .replicaNode()(TableName.SecretSharing)
        .where(`${TableName.SecretSharing}.orgId`, orgId)
        .where((qb) => {
          if ("userId" in actorFilters && "identityId" in actorFilters) {
            void qb
              .where(`${TableName.SecretSharing}.userId`, actorFilters.userId)
              .orWhere(`${TableName.SecretSharing}.identityId`, actorFilters.identityId);
          } else if ("userId" in actorFilters) {
            void qb.where(`${TableName.SecretSharing}.userId`, actorFilters.userId);
          } else if ("identityId" in actorFilters) {
            void qb.where(`${TableName.SecretSharing}.identityId`, actorFilters.identityId);
          }
        })
        .where(`${TableName.SecretSharing}.type`, type)
        .count("*")
        .first();

      return parseInt((count as unknown as CountResult).count || "0", 10);
    } catch (error) {
      throw new DatabaseError({ error, name: "Count all user-org shared secrets" });
    }
  };

  const pruneExpiredSharedSecrets = async (tx?: Knex) => {
    logger.info(`${QueueName.DailyResourceCleanUp}: pruning expired shared secret started`);
    try {
      const today = new Date();
      const docs = await (tx || db)(TableName.SecretSharing)
        .where("expiresAt", "<", today)
        .andWhere("encryptedValue", "<>", "")
        .andWhere("type", SecretSharingType.Share)
        .update({
          encryptedValue: "",
          tag: "",
          iv: ""
        });
      logger.info(`${QueueName.DailyResourceCleanUp}: pruning expired shared secret completed`);
      return docs;
    } catch (error) {
      throw new DatabaseError({ error, name: "pruneExpiredSharedSecrets" });
    }
  };

  const pruneExpiredSecretRequests = async (tx?: Knex) => {
    logger.info(`${QueueName.DailyResourceCleanUp}: pruning expired secret requests started`);
    try {
      const today = new Date();

      const docs = await (tx || db)(TableName.SecretSharing)
        .whereNotNull("expiresAt")
        .andWhere("expiresAt", "<", today)
        .andWhere("encryptedSecret", null)
        .andWhere("type", SecretSharingType.Request)
        .delete();

      logger.info(`${QueueName.DailyResourceCleanUp}: pruning expired secret requests completed`);

      return docs;
    } catch (error) {
      throw new DatabaseError({ error, name: "pruneExpiredSecretRequests" });
    }
  };

  const findActiveSharedSecrets = async (filters: Partial<TSecretSharing>, tx?: Knex) => {
    try {
      const now = new Date();
      return await (tx || db.replicaNode())(TableName.SecretSharing)
        .where(filters)
        .andWhere("expiresAt", ">", now)
        .andWhere("encryptedValue", "<>", "")
        .andWhere("type", SecretSharingType.Share)
        .select(selectAllTableCols(TableName.SecretSharing))
        .orderBy("expiresAt", "asc");
    } catch (error) {
      throw new DatabaseError({
        error,
        name: "Find Active Shared Secrets"
      });
    }
  };

  const softDeleteById = async (id: string) => {
    try {
      await sharedSecretOrm.updateById(id, {
        encryptedValue: "",
        iv: "",
        tag: ""
      });
    } catch (error) {
      throw new DatabaseError({
        error,
        name: "Soft Delete Shared Secret"
      });
    }
  };

  return {
    ...sharedSecretOrm,
    countAllUserOrgSharedSecrets,
    pruneExpiredSharedSecrets,
    pruneExpiredSecretRequests,
    softDeleteById,
    findActiveSharedSecrets,
    getSecretRequestById
  };
};
