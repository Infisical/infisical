import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { ormify, selectAllTableCols } from "@app/lib/knex";

export type TAppConnectionCredentialRotationDALFactory = ReturnType<typeof appConnectionCredentialRotationDALFactory>;

export const appConnectionCredentialRotationDALFactory = (db: TDbClient) => {
  const orm = ormify(db, TableName.AppConnectionCredentialRotation);

  const findByConnectionId = async (connectionId: string, tx?: Knex) => {
    const rotation = await (tx || db.replicaNode())(TableName.AppConnectionCredentialRotation)
      .where(`${TableName.AppConnectionCredentialRotation}.connectionId`, connectionId)
      .first();

    return rotation || null;
  };

  const findRotationsDueForQueue = async (rotateBy: Date, tx?: Knex) => {
    const rotations = await (tx || db.replicaNode())(TableName.AppConnectionCredentialRotation)
      .join(
        TableName.AppConnection,
        `${TableName.AppConnectionCredentialRotation}.connectionId`,
        `${TableName.AppConnection}.id`
      )
      .where(`${TableName.AppConnection}.isAutoRotationEnabled`, true)
      .where(`${TableName.AppConnectionCredentialRotation}.nextRotationAt`, "<=", rotateBy)
      .select(selectAllTableCols(TableName.AppConnectionCredentialRotation))
      .select(db.ref("orgId").withSchema(TableName.AppConnection));

    return rotations;
  };

  const findByIdWithConnection = async (id: string, tx?: Knex) => {
    const result = await (tx || db.replicaNode())(TableName.AppConnectionCredentialRotation)
      .where(`${TableName.AppConnectionCredentialRotation}.id`, id)
      .join(
        TableName.AppConnection,
        `${TableName.AppConnectionCredentialRotation}.connectionId`,
        `${TableName.AppConnection}.id`
      )
      .select(
        selectAllTableCols(TableName.AppConnectionCredentialRotation),
        db.ref("orgId").withSchema(TableName.AppConnection),
        db.ref("name").withSchema(TableName.AppConnection).as("connectionName"),
        db.ref("app").withSchema(TableName.AppConnection).as("connectionApp"),
        db.ref("method").withSchema(TableName.AppConnection).as("connectionMethod"),
        db.ref("encryptedCredentials").withSchema(TableName.AppConnection).as("connectionEncryptedCredentials"),
        db.ref("isAutoRotationEnabled").withSchema(TableName.AppConnection)
      )
      .first();

    return result || null;
  };

  return {
    ...orm,
    findByConnectionId,
    findRotationsDueForQueue,
    findByIdWithConnection
  };
};
