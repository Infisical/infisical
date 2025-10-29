import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { TPkiAcmeOrdersInsert, TPkiAcmeOrdersUpdate } from "@app/db/schemas/pki-acme-orders";
import { DatabaseError } from "@app/lib/errors";
import { ormify } from "@app/lib/knex";

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

  const findByAccountId = async (accountId: string, tx?: Knex) => {
    try {
      const orders = await (tx || db)(TableName.PkiAcmeOrder).where({ accountId });

      return orders;
    } catch (error) {
      throw new DatabaseError({ error, name: "Find PKI ACME orders by account id" });
    }
  };

  const findByStatus = async (status: string, tx?: Knex) => {
    try {
      const orders = await (tx || db)(TableName.PkiAcmeOrder).where({ status });

      return orders;
    } catch (error) {
      throw new DatabaseError({ error, name: "Find PKI ACME orders by status" });
    }
  };

  const findByAccountIdAndStatus = async (accountId: string, status: string, tx?: Knex) => {
    try {
      const orders = await (tx || db)(TableName.PkiAcmeOrder).where({ accountId, status });

      return orders;
    } catch (error) {
      throw new DatabaseError({ error, name: "Find PKI ACME orders by account id and status" });
    }
  };

  const deleteById = async (id: string, tx?: Knex) => {
    try {
      const result = await (tx || db)(TableName.PkiAcmeOrder).where({ id }).delete().returning("*");
      const [order] = result;

      return order || null;
    } catch (error) {
      throw new DatabaseError({ error, name: "Delete PKI ACME order by id" });
    }
  };

  const deleteByAccountId = async (accountId: string, tx?: Knex) => {
    try {
      const result = await (tx || db)(TableName.PkiAcmeOrder).where({ accountId }).delete().returning("*");

      return result;
    } catch (error) {
      throw new DatabaseError({ error, name: "Delete PKI ACME orders by account id" });
    }
  };

  return {
    ...pkiAcmeOrderOrm,
    create,
    updateById,
    findById,
    findByAccountId,
    findByStatus,
    findByAccountIdAndStatus,
    deleteById,
    deleteByAccountId
  };
};
