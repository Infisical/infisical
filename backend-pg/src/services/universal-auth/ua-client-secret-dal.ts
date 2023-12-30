import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify } from "@app/lib/knex";

export type TUaClientSecretDalFactory = ReturnType<typeof uaClientSecretDalFactory>;

export const uaClientSecretDalFactory = (db: TDbClient) => {
  const uaClientSecretOrm = ormify(db, TableName.IdentityUaClientSecret);

  const incrementUsage = async (id: string, tx?: Knex) => {
    try {
      const [doc] = await (tx || db)(TableName.IdentityUaClientSecret)
        .where({ id })
        .update({ clientSecretLastUsedAt: new Date() })
        .increment("clientSecretNumUses", 1)
        .returning("*");
      return doc;
    } catch (error) {
      throw new DatabaseError({ error, name: "IncrementUsage" });
    }
  };

  return { ...uaClientSecretOrm, incrementUsage };
};
