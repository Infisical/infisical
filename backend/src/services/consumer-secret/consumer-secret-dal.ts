import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify } from "@app/lib/knex";

interface ConsumerSecret {
  id: string;
  userId: string;
  orgId: string;
  type: string;
  username?: string;
  password?: string;
  cardNumber?: string;
  expiryDate?: string;
  cvv?: string;
  title?: string;
  content?: string;
}

export type TConsumerSecretsDALFactory = ReturnType<typeof consumerSecretsDALFactory>;

export const consumerSecretsDALFactory = (db: TDbClient) => {
  const consumerSecretOrm = ormify(db, TableName.ConsumerSecret);

  const findAllByUser = async (userId: string, organizationId: string, tx?: Knex): Promise<ConsumerSecret[]> => {
    try {
      return await (tx || db)(TableName.ConsumerSecret)
        .where({ userId, orgId: organizationId })
        .select<ConsumerSecret[]>("*"); // Specify that each selected row is a ConsumerSecret object
    } catch (error) {
      throw new DatabaseError({ error, name: "findAllByUser" });
    }
  };

  const findById = async (id: string, tx?: Knex): Promise<ConsumerSecret | undefined> => {
    try {
      return await (tx || db)<ConsumerSecret>(TableName.ConsumerSecret).where({ id }).first();
    } catch (error) {
      throw new DatabaseError({ error, name: "findById" });
    }
  };

  const createSecret = async (secret: Partial<ConsumerSecret>, tx?: Knex): Promise<string> => {
    try {
      const result = await (tx || db)(TableName.ConsumerSecret).insert(secret).returning<{ id: string }[]>("id");
      const { id } = result[0]; // TypeScript now knows result[0] is of type { id: string }
      return id;
    } catch (error) {
      throw new DatabaseError({ error, name: "createSecret" });
    }
  };

  const updateSecret = async (id: string, secret: Partial<ConsumerSecret>, tx?: Knex): Promise<number> => {
    try {
      return await (tx || db)(TableName.ConsumerSecret).where({ id }).update(secret);
    } catch (error) {
      throw new DatabaseError({ error, name: "updateSecret" });
    }
  };

  const deleteSecret = async (id: string, tx?: Knex): Promise<number> => {
    try {
      return await (tx || db)(TableName.ConsumerSecret).where({ id }).del();
    } catch (error) {
      throw new DatabaseError({ error, name: "deleteSecret" });
    }
  };

  return {
    ...consumerSecretOrm,
    findAllByUser,
    findById,
    createSecret,
    updateSecret,
    deleteSecret
  };
};
