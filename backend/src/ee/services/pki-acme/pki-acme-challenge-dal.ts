import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName, TPkiAcmeChallenges } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify, selectAllTableCols } from "@app/lib/knex";

import { AcmeAuthStatus, AcmeChallengeStatus, AcmeOrderStatus } from "./pki-acme-schemas";

export type TPkiAcmeChallengeDALFactory = ReturnType<typeof pkiAcmeChallengeDALFactory>;

export const pkiAcmeChallengeDALFactory = (db: TDbClient) => {
  const pkiAcmeChallengeOrm = ormify(db, TableName.PkiAcmeChallenge);

  const markAsValidCascadeById = async (id: string, tx?: Knex): Promise<TPkiAcmeChallenges> => {
    try {
      const [challenge] = (await (tx || db)(TableName.PkiAcmeChallenge)
        .where({ id })
        .update({ status: AcmeChallengeStatus.Valid, validatedAt: new Date() })
        .returning("*")) as [TPkiAcmeChallenges];

      // Update pending auth to valid as well
      const updatedAuths = await (tx || db)(TableName.PkiAcmeAuth)
        .where({ id: challenge.authId, status: AcmeAuthStatus.Pending })
        .update({ status: AcmeAuthStatus.Valid })
        .returning("id");

      if (updatedAuths.length > 0) {
        // Find all the orders that are involved in the challenge validation
        const involvedOrderIds = (tx || db)({ o: TableName.PkiAcmeOrder })
          .distinct("o.id")
          .join({ oa: TableName.PkiAcmeOrderAuth }, "o.id", "oa.orderId")
          .join({ a: TableName.PkiAcmeAuth }, "oa.authId", `a.id`)
          .whereIn(
            "a.id",
            updatedAuths.map((auth) => auth.id)
          );
        // Update status for pending orders that have all auths valid
        await (tx || db)(TableName.PkiAcmeOrder)
          .whereIn("id", (qb) => {
            void qb
              .select("o2.id")
              .from({ o2: TableName.PkiAcmeOrder })
              .join({ oa2: TableName.PkiAcmeOrderAuth }, "o2.id", "oa2.orderId")
              .join({ a2: TableName.PkiAcmeAuth }, "oa2.authId", "a2.id")
              .groupBy("o2.id")
              // All auths should be valid for the order to be ready
              .havingRaw("SUM(CASE WHEN a2.status = ? THEN 1 ELSE 0 END) = COUNT(DISTINCT a2.id)", [
                AcmeAuthStatus.Valid
              ])
              // Only update orders that are pending
              .where("o2.status", AcmeOrderStatus.Pending)
              .whereIn("o2.id", involvedOrderIds);
          })
          .update({ status: AcmeOrderStatus.Ready });
      }

      return challenge;
    } catch (error) {
      throw new DatabaseError({ error, name: "Update certificate profile" });
    }
  };

  const markAsInvalidCascadeById = async (id: string, tx?: Knex): Promise<TPkiAcmeChallenges> => {
    try {
      const [challenge] = (await (tx || db)(TableName.PkiAcmeChallenge)
        .where({ id })
        .update({ status: AcmeChallengeStatus.Invalid })
        .returning("*")) as [TPkiAcmeChallenges];

      // Update pending auth to valid as well
      const updatedAuths = await (tx || db)(TableName.PkiAcmeAuth)
        .where({ id: challenge.authId, status: AcmeAuthStatus.Pending })
        .update({ status: AcmeAuthStatus.Invalid })
        .returning("id");

      if (updatedAuths.length > 0) {
        // Update status for pending orders that have all auths valid
        await (tx || db)(TableName.PkiAcmeOrder)
          .whereIn("id", (qb) => {
            void qb
              .select("o.id")
              .from({ o: TableName.PkiAcmeOrder })
              .join(TableName.PkiAcmeOrderAuth, "o.id", `${TableName.PkiAcmeOrderAuth}.orderId`)
              .join(TableName.PkiAcmeAuth, `${TableName.PkiAcmeOrderAuth}.authId`, `${TableName.PkiAcmeAuth}.id`)
              // We only update orders that are pending
              .where("o.status", AcmeOrderStatus.Pending)
              .whereIn(
                `${TableName.PkiAcmeAuth}.id`,
                updatedAuths.map((auth) => auth.id)
              );
          })
          .update({ status: AcmeOrderStatus.Invalid });
      }

      // TODO: update order status to invalid as well
      return challenge;
    } catch (error) {
      throw new DatabaseError({ error, name: "Update certificate profile" });
    }
  };

  const findByAccountAuthAndChallengeId = async (accountId: string, authId: string, challengeId: string, tx?: Knex) => {
    try {
      const challenge = await (tx || db)(TableName.PkiAcmeChallenge)
        .join(TableName.PkiAcmeAuth, `${TableName.PkiAcmeChallenge}.authId`, `${TableName.PkiAcmeAuth}.id`)
        .select(selectAllTableCols(TableName.PkiAcmeChallenge))
        .where(`${TableName.PkiAcmeChallenge}.id`, challengeId)
        .where(`${TableName.PkiAcmeChallenge}.authId`, authId)
        .where(`${TableName.PkiAcmeAuth}.accountId`, accountId)
        .first();
      if (!challenge) {
        return null;
      }
      return challenge;
    } catch (error) {
      throw new DatabaseError({ error, name: "Find PKI ACME challenge by account id, auth id and challenge id" });
    }
  };

  const findByIdForChallengeValidation = async (id: string, tx?: Knex) => {
    const result = await (tx || db)(TableName.PkiAcmeChallenge)
      .join(TableName.PkiAcmeAuth, `${TableName.PkiAcmeChallenge}.authId`, `${TableName.PkiAcmeAuth}.id`)
      .join(TableName.PkiAcmeAccount, `${TableName.PkiAcmeAuth}.accountId`, `${TableName.PkiAcmeAccount}.id`)
      .join(
        TableName.PkiCertificateProfile,
        `${TableName.PkiAcmeAccount}.profileId`,
        `${TableName.PkiCertificateProfile}.id`
      )
      .select(
        selectAllTableCols(TableName.PkiAcmeChallenge),
        db.ref("id").withSchema(TableName.PkiAcmeAuth).as("authId"),
        db.ref("token").withSchema(TableName.PkiAcmeAuth).as("authToken"),
        db.ref("status").withSchema(TableName.PkiAcmeAuth).as("authStatus"),
        db.ref("identifierType").withSchema(TableName.PkiAcmeAuth).as("authIdentifierType"),
        db.ref("identifierValue").withSchema(TableName.PkiAcmeAuth).as("authIdentifierValue"),
        db.ref("expiresAt").withSchema(TableName.PkiAcmeAuth).as("authExpiresAt"),
        db.ref("id").withSchema(TableName.PkiAcmeAccount).as("accountId"),
        db.ref("publicKeyThumbprint").withSchema(TableName.PkiAcmeAccount).as("accountPublicKeyThumbprint"),
        db.ref("profileId").withSchema(TableName.PkiAcmeAccount).as("profileId"),
        db.ref("projectId").withSchema(TableName.PkiCertificateProfile).as("projectId")
      )
      // For all challenges, acquire update lock on the auth to avoid race conditions
      .forUpdate(TableName.PkiAcmeAuth)
      .where(`${TableName.PkiAcmeChallenge}.id`, id)
      .first();
    if (!result) {
      return null;
    }
    const {
      authId,
      authToken,
      authStatus,
      authIdentifierType,
      authIdentifierValue,
      authExpiresAt,
      accountId,
      accountPublicKeyThumbprint,
      profileId,
      projectId,
      ...challenge
    } = result;
    return {
      ...challenge,
      auth: {
        token: authToken,
        status: authStatus,
        identifierType: authIdentifierType,
        identifierValue: authIdentifierValue,
        expiresAt: authExpiresAt,
        account: {
          id: accountId,
          publicKeyThumbprint: accountPublicKeyThumbprint,
          project: {
            id: projectId
          },
          profileId
        }
      }
    };
  };

  return {
    ...pkiAcmeChallengeOrm,
    markAsValidCascadeById,
    markAsInvalidCascadeById,
    findByAccountAuthAndChallengeId,
    findByIdForChallengeValidation
  };
};
