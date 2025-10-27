import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify } from "@app/lib/knex";

import { TAcmeEnrollmentConfigInsert, TAcmeEnrollmentConfigUpdate } from "./enrollment-config-types";

export type TAcmeEnrollmentConfigDALFactory = ReturnType<typeof acmeEnrollmentConfigDALFactory>;

export const acmeEnrollmentConfigDALFactory = (db: TDbClient) => {
  const acmeEnrollmentConfigOrm = ormify(db, TableName.PkiAcmeEnrollmentConfig);

  const create = async (data: TAcmeEnrollmentConfigInsert, tx?: Knex) => {
    try {
      const result = await (tx || db)(TableName.PkiAcmeEnrollmentConfig).insert(data).returning("*");
      const [acmeConfig] = result;

      if (!acmeConfig) {
        throw new Error("Failed to create ACME enrollment config");
      }

      return acmeConfig;
    } catch (error) {
      throw new DatabaseError({ error, name: "Create ACME enrollment config" });
    }
  };

  const updateById = async (id: string, data: TAcmeEnrollmentConfigUpdate, tx?: Knex) => {
    try {
      const result = await (tx || db)(TableName.PkiAcmeEnrollmentConfig).where({ id }).update(data).returning("*");
      const [acmeConfig] = result;

      if (!acmeConfig) {
        return null;
      }

      return acmeConfig;
    } catch (error) {
      throw new DatabaseError({ error, name: "Update ACME enrollment config" });
    }
  };

  const findById = async (id: string, tx?: Knex) => {
    try {
      const acmeConfig = await (tx || db)(TableName.PkiAcmeEnrollmentConfig).where({ id }).first();

      return acmeConfig || null;
    } catch (error) {
      throw new DatabaseError({ error, name: "Find ACME enrollment config by id" });
    }
  };

  return {
    ...acmeEnrollmentConfigOrm,
    create,
    updateById,
    findById
  };
};
