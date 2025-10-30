import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName, TPkiAcmeAuths } from "@app/db/schemas";
import { TPkiAcmeOrdersInsert, TPkiAcmeOrdersUpdate } from "@app/db/schemas/pki-acme-orders";
import { DatabaseError } from "@app/lib/errors";
import { ormify, selectAllTableCols } from "@app/lib/knex";

export type TPkiAcmeOrderDALFactory = ReturnType<typeof pkiAcmeOrderDALFactory>;

export const pkiAcmeOrderDALFactory = (db: TDbClient) => {
  const pkiAcmeOrderOrm = ormify(db, TableName.PkiAcmeOrder);

  const create = async (data: TPkiAcmeOrdersInsert, tx?: Knex) => {
    try {
      const result = await (tx || db)(TableName.PkiAcmeOrder).insert(data).returning("*");
      const [order] = result;

      if (!order) {
        throw new Error("Failed to create PKI ACME order");
      }

      return order;
    } catch (error) {
      throw new DatabaseError({ error, name: "Create PKI ACME order" });
    }
  };

  const updateById = async (id: string, data: TPkiAcmeOrdersUpdate, tx?: Knex) => {
    try {
      const result = await (tx || db)(TableName.PkiAcmeOrder).where({ id }).update(data).returning("*");
      const [order] = result;

      if (!order) {
        return null;
      }

      return order;
    } catch (error) {
      throw new DatabaseError({ error, name: "Update PKI ACME order" });
    }
  };

  const findById = async (id: string, tx?: Knex) => {
    try {
      const order = await (tx || db)(TableName.PkiAcmeOrder).where({ id }).first();

      return order || null;
    } catch (error) {
      throw new DatabaseError({ error, name: "Find PKI ACME order by id" });
    }
  };

  const findByIdWithAuthorizations = async (id: string, tx?: Knex) => {
    try {
      const order = await (tx || db)(TableName.PkiAcmeOrder)
        .join(TableName.PkiAcmeOrderAuth, `${TableName.PkiAcmeOrderAuth}.orderId`, `${TableName.PkiAcmeOrder}.id`)
        .join(TableName.PkiAcmeAuth, `${TableName.PkiAcmeOrderAuth}.authId`, `${TableName.PkiAcmeAuth}.id`)
        .select(
          selectAllTableCols(TableName.PkiAcmeOrder),
          db.ref("id").withSchema(TableName.PkiAcmeAuth).as("authId"),
          db.ref("identifierType").withSchema(TableName.PkiAcmeAuth).as("identifierType"),
          db.ref("identifierValue").withSchema(TableName.PkiAcmeAuth).as("identifierValue"),
          db.ref("expiresAt").withSchema(TableName.PkiAcmeAuth).as("expiresAt")
        )
        .where(`${TableName.PkiAcmeOrder}.id`, id)
        .first();

      if (!order) {
        return null;
      }
      return {
        ...order,
        authorizations: order.authorizations.map((auth: TPkiAcmeAuths) => ({
          id: auth.id,
          identifierType: auth.identifierType,
          identifierValue: auth.identifierValue,
          expiresAt: auth.expiresAt
        }))
      };
    } catch (error) {
      throw new DatabaseError({ error, name: "Find PKI ACME order by id" });
    }
  };

  return {
    ...pkiAcmeOrderOrm,
    create,
    updateById,
    findById,
    findByIdWithAuthorizations
  };
};
