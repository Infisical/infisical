import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas/models";
import { DatabaseError } from "@app/lib/errors";
import { ormify } from "@app/lib/knex";

import { TEstEnrollmentConfigInsert, TEstEnrollmentConfigUpdate } from "./enrollment-config-types";

export type TEstEnrollmentConfigDALFactory = ReturnType<typeof estEnrollmentConfigDALFactory>;

export const estEnrollmentConfigDALFactory = (db: TDbClient) => {
  const estEnrollmentConfigOrm = ormify(db, TableName.PkiEstEnrollmentConfig);

  const create = async (data: TEstEnrollmentConfigInsert, tx?: Knex) => {
    try {
      const result = await (tx || db)(TableName.PkiEstEnrollmentConfig).insert(data).returning("*");
      const [estConfig] = result;

      if (!estConfig) {
        throw new Error("Failed to create EST enrollment config");
      }

      return estConfig;
    } catch (error) {
      throw new DatabaseError({ error, name: "Create EST enrollment config" });
    }
  };

  const updateById = async (id: string, data: TEstEnrollmentConfigUpdate, tx?: Knex) => {
    try {
      const result = await (tx || db)(TableName.PkiEstEnrollmentConfig).where({ id }).update(data).returning("*");
      const [estConfig] = result;

      if (!estConfig) {
        return null;
      }

      return estConfig;
    } catch (error) {
      throw new DatabaseError({ error, name: "Update EST enrollment config" });
    }
  };

  const findById = async (id: string, tx?: Knex) => {
    try {
      const estConfig = await (tx || db)(TableName.PkiEstEnrollmentConfig).where({ id }).first();

      return estConfig || null;
    } catch (error) {
      throw new DatabaseError({ error, name: "Find EST enrollment config by id" });
    }
  };

  return {
    ...estEnrollmentConfigOrm,
    create,
    updateById,
    findById
  };
};
