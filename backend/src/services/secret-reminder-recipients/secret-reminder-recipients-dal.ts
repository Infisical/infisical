import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { AccessScope, TableName } from "@app/db/schemas/models";
import { ormify, selectAllTableCols } from "@app/lib/knex";

export type TSecretReminderRecipientsDALFactory = ReturnType<typeof secretReminderRecipientsDALFactory>;

export const secretReminderRecipientsDALFactory = (db: TDbClient) => {
  const secretReminderRecipientsOrm = ormify(db, TableName.SecretReminderRecipients);

  const findUsersBySecretId = async (secretId: string, tx?: Knex) => {
    const res = await (tx || db.replicaNode())(TableName.SecretReminderRecipients)
      .where({ secretId })
      .leftJoin(TableName.Users, `${TableName.SecretReminderRecipients}.userId`, `${TableName.Users}.id`)
      .leftJoin(TableName.Project, `${TableName.SecretReminderRecipients}.projectId`, `${TableName.Project}.id`)
      .leftJoin(TableName.Membership, (bd) => {
        void bd
          .on(`${TableName.Membership}.actorUserId`, "=", `${TableName.SecretReminderRecipients}.userId`)
          .andOn(`${TableName.Membership}.scopeOrgId`, "=", `${TableName.Project}.orgId`)
          .andOn(`${TableName.Membership}.scope`, db.raw("?", [AccessScope.Organization]));
      })
      .where(`${TableName.Membership}.isActive`, true)
      .select(selectAllTableCols(TableName.SecretReminderRecipients))
      .select(
        db.ref("email").withSchema(TableName.Users).as("email"),
        db.ref("username").withSchema(TableName.Users).as("username"),
        db.ref("firstName").withSchema(TableName.Users).as("firstName"),
        db.ref("lastName").withSchema(TableName.Users).as("lastName")
      );

    return res;
  };

  return { ...secretReminderRecipientsOrm, findUsersBySecretId };
};
