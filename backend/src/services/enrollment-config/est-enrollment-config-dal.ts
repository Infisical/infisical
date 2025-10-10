import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify } from "@app/lib/knex";

import { TEstEnrollmentConfigInsert, TEstEnrollmentConfigUpdate } from "./enrollment-config-types";

export type TEstEnrollmentConfigDALFactory = ReturnType<typeof estEnrollmentConfigDALFactory>;

export const estEnrollmentConfigDALFactory = (db: TDbClient) => {
  const estEnrollmentConfigOrm = ormify(db, TableName.PkiEstEnrollmentConfig);

  const create = async (data: TEstEnrollmentConfigInsert, tx?: Knex) => {
    try {
      const [estConfig] = await (tx || db)(TableName.PkiEstEnrollmentConfig).insert(data).returning("*");

      return estConfig;
    } catch (error) {
      throw new DatabaseError({ error, name: "Create EST enrollment config" });
    }
  };

  const updateById = async (id: string, data: TEstEnrollmentConfigUpdate, tx?: Knex) => {
    try {
      const [estConfig] = await (tx || db)(TableName.PkiEstEnrollmentConfig).where({ id }).update(data).returning("*");

      return estConfig;
    } catch (error) {
      throw new DatabaseError({ error, name: "Update EST enrollment config" });
    }
  };

  const deleteById = async (id: string, tx?: Knex) => {
    try {
      const [estConfig] = await (tx || db)(TableName.PkiEstEnrollmentConfig).where({ id }).del().returning("*");

      return estConfig;
    } catch (error) {
      throw new DatabaseError({ error, name: "Delete EST enrollment config" });
    }
  };

  const findById = async (id: string, tx?: Knex) => {
    try {
      const estConfig = await (tx || db)(TableName.PkiEstEnrollmentConfig).where({ id }).first();

      return estConfig;
    } catch (error) {
      throw new DatabaseError({ error, name: "Find EST enrollment config by id" });
    }
  };

  const isConfigInUse = async (configId: string, tx?: Knex) => {
    try {
      const profileCount = await (tx || db)(TableName.CertificateProfile)
        .where({ estConfigId: configId })
        .count("* as count")
        .first();

      return parseInt(profileCount || "0", 10) > 0;
    } catch (error) {
      throw new DatabaseError({ error, name: "Check if EST enrollment config is in use" });
    }
  };

  return {
    ...estEnrollmentConfigOrm,
    create,
    updateById,
    deleteById,
    findById,
    isConfigInUse
  };
};
