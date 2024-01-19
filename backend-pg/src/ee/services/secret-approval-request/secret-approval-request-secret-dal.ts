import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify, selectAllTableCols } from "@app/lib/knex";

export type TSecretApprovalRequestSecretDALFactory = ReturnType<typeof secretApprovalRequestSecretDALFactory>;

export const secretApprovalRequestSecretDALFactory = (db: TDbClient) => {
  const sarSecretOrm = ormify(db, TableName.SecretApprovalRequestSecret);

  const findByRequestId = async (requestId: string, tx?: Knex) => {
    try {
      const doc = await (tx || db)(TableName.SecretApprovalRequestSecret)
        .where({ requestId })
        .leftJoin(
          TableName.Secret,
          `${TableName.SecretApprovalRequestSecret}.secretId`,
          `${TableName.Secret}.id`
        )
        .leftJoin(
          TableName.SecretVersion,
          `${TableName.SecretVersion}.id`,
          `${TableName.SecretApprovalRequestSecret}.secretVersion`
        )
        .select(selectAllTableCols(TableName.SecretApprovalRequestSecret))
        .select(
          db.ref("secretBlindIndex").withSchema(TableName.Secret).as("orgSecBlindIndex"),
          db.ref("version").withSchema(TableName.Secret).as("orgSecVersion"),
          db.ref("secretKeyIV").withSchema(TableName.Secret).as("orgSecKeyIV"),
          db.ref("secretKeyTag").withSchema(TableName.Secret).as("orgSecKeyTag"),
          db.ref("secretKeyCiphertext").withSchema(TableName.Secret).as("orgSecKeyCiphertext"),
          db.ref("secretValueIV").withSchema(TableName.Secret).as("orgSecValueIV"),
          db.ref("secretValueTag").withSchema(TableName.Secret).as("orgSecValueTag"),
          db.ref("secretValueCiphertext").withSchema(TableName.Secret).as("orgSecValueCiphertext"),
          db.ref("secretCommentIV").withSchema(TableName.Secret).as("orgSecCommentIV"),
          db.ref("secretCommentTag").withSchema(TableName.Secret).as("orgSecCommentTag"),
          db
            .ref("secretCommentCiphertext")
            .withSchema(TableName.Secret)
            .as("orgSecCommentCiphertext")
        )
        .select(
          // db.ref("secretBlindIndex").withSchema(TableName.Secret).as("orgSecBlindInex"),
          db.ref("version").withSchema(TableName.SecretVersion).as("secVerVersion"),
          db.ref("secretKeyIV").withSchema(TableName.SecretVersion).as("secVerKeyIV"),
          db.ref("secretKeyTag").withSchema(TableName.SecretVersion).as("secVerKeyTag"),
          db
            .ref("secretKeyCiphertext")
            .withSchema(TableName.SecretVersion)
            .as("secVerKeyCiphertext"),
          db.ref("secretValueIV").withSchema(TableName.SecretVersion).as("secVerValueIV"),
          db.ref("secretValueTag").withSchema(TableName.SecretVersion).as("secVerValueTag"),
          db
            .ref("secretValueCiphertext")
            .withSchema(TableName.SecretVersion)
            .as("secVerValueCiphertext"),
          db.ref("secretCommentIV").withSchema(TableName.SecretVersion).as("secVerCommentIV"),
          db.ref("secretCommentTag").withSchema(TableName.SecretVersion).as("secVerCommentTag"),
          db
            .ref("secretCommentCiphertext")
            .withSchema(TableName.SecretVersion)
            .as("secVerCommentCiphertext")
        );
      return doc.map(
        ({
          orgSecKeyIV,
          orgSecKeyTag,
          orgSecValueIV,
          orgSecVersion,
          orgSecValueTag,
          orgSecCommentIV,
          orgSecBlindIndex,
          orgSecCommentTag,
          orgSecKeyCiphertext,
          orgSecValueCiphertext,
          orgSecCommentCiphertext,
          secVerCommentIV,
          secVerCommentCiphertext,
          secVerCommentTag,
          secVerValueCiphertext,
          secVerKeyIV,
          secVerKeyTag,
          secVerValueIV,
          secVerVersion,
          secVerValueTag,
          secVerKeyCiphertext,
          ...el
        }) => ({
          ...el,
          secret: el.secretId
            ? {
                id: el.secretId,
                version: orgSecVersion,
                secretBlindIndex: orgSecBlindIndex,
                secretKeyIV: orgSecKeyIV,
                secretKeyTag: orgSecKeyTag,
                secretKeyCiphertext: orgSecKeyCiphertext,
                secretValueIV: orgSecValueIV,
                secretValueTag: orgSecValueTag,
                secretValueCiphertext: orgSecValueCiphertext,
                secretCommentIV: orgSecCommentIV,
                secretCommentTag: orgSecCommentTag,
                secretCommentCiphertext: orgSecCommentCiphertext
              }
            : undefined,
          secretVersion: el.secretVersion
            ? {
                id: el.secretVersion,
                secretKeyIV: secVerKeyIV,
                secretKeyTag: secVerKeyTag,
                secretKeyCiphertext: secVerKeyCiphertext,
                secretValueIV: secVerValueIV,
                secretValueTag: secVerValueTag,
                secretValueCiphertext: secVerValueCiphertext,
                secretCommentIV: secVerCommentIV,
                secretCommentTag: secVerCommentTag,
                secretCommentCiphertext: secVerCommentCiphertext
              }
            : undefined
        })
      );
    } catch (error) {
      throw new DatabaseError({ error, name: "FindByRequestId" });
    }
  };
  return { ...sarSecretOrm, findByRequestId };
};
