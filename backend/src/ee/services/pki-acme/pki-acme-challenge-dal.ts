import { TDbClient } from "@app/db";
import { TableName, TPkiAcmeAccounts, TPkiAcmeAuths } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify, selectAllTableCols, sqlNestRelationships } from "@app/lib/knex";
import { Knex } from "knex";

export type TPkiAcmeChallengeDALFactory = ReturnType<typeof pkiAcmeChallengeDALFactory>;

export const pkiAcmeChallengeDALFactory = (db: TDbClient) => {
  const pkiAcmeChallengeOrm = ormify(db, TableName.PkiAcmeChallenge);

  const findByAccountAuthAndChallengeIdWithToken = async (
    accountId: string,
    authId: string,
    challengeId: string,
    tx?: Knex
  ) => {
    try {
      const challenge = await (tx || db)(TableName.PkiAcmeChallenge)
        .join(TableName.PkiAcmeAuth, `${TableName.PkiAcmeChallenge}.authId`, `${TableName.PkiAcmeAuth}.id`)
        .select(
          selectAllTableCols(TableName.PkiAcmeChallenge),
          db.ref("token").withSchema(TableName.PkiAcmeAuth).as("token")
        )
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
    const rows = await (tx || db)(TableName.PkiAcmeChallenge)
      .join<TPkiAcmeAuths>(TableName.PkiAcmeAuth, `${TableName.PkiAcmeChallenge}.authId`, `${TableName.PkiAcmeAuth}.id`)
      .join<TPkiAcmeAccounts>(
        TableName.PkiAcmeAccount,
        `${TableName.PkiAcmeAuth}.accountId`,
        `${TableName.PkiAcmeAccount}.id`
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
        db.ref("publicKeyThumbprint").withSchema(TableName.PkiAcmeAccount).as("accountPublicKeyThumbprint")
      )
      // For all challenges, acquire update lock on the auth to avoid race conditions
      .forUpdate(TableName.PkiAcmeAuth)
      .where(`${TableName.PkiAcmeChallenge}.id`, id);

    if (rows.length === 0) {
      return null;
    }
    return sqlNestRelationships({
      data: rows,
      key: "id",
      parentMapper: (row) => row,
      childrenMapper: [
        {
          key: "authId",
          label: "auth" as const,
          mapper: ({ authId, authToken, authStatus, authIdentifierType, authIdentifierValue, authExpiresAt }) => ({
            id: authId,
            token: authToken,
            status: authStatus,
            identifierType: authIdentifierType,
            identifierValue: authIdentifierValue,
            expiresAt: authExpiresAt
          }),
          childrenMapper: [
            {
              key: "accountId",
              label: "account" as const,
              mapper: ({ accountId, accountPublicKeyThumbprint }) => ({
                id: accountId,
                publicKeyThumbprint: accountPublicKeyThumbprint
              })
            }
          ]
        }
      ]
    })?.[0];
  };

  return {
    ...pkiAcmeChallengeOrm,
    findByAccountAuthAndChallengeIdWithToken,
    findByIdForChallengeValidation
  };
};
