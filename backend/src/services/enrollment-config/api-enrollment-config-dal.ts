import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify } from "@app/lib/knex";

import { TApiEnrollmentConfigInsert, TApiEnrollmentConfigUpdate } from "./enrollment-config-types";

export type TApiEnrollmentConfigDALFactory = ReturnType<typeof apiEnrollmentConfigDALFactory>;

export const apiEnrollmentConfigDALFactory = (db: TDbClient) => {
  const apiEnrollmentConfigOrm = ormify(db, TableName.PkiApiEnrollmentConfig);

  const create = async (data: TApiEnrollmentConfigInsert, tx?: Knex) => {
    try {
      const [apiConfig] = await (tx || db)(TableName.PkiApiEnrollmentConfig).insert(data).returning("*");

      return apiConfig;
    } catch (error) {
      throw new DatabaseError({ error, name: "Create API enrollment config" });
    }
  };

  const updateById = async (id: string, data: TApiEnrollmentConfigUpdate, tx?: Knex) => {
    try {
      const [apiConfig] = await (tx || db)(TableName.PkiApiEnrollmentConfig).where({ id }).update(data).returning("*");

      return apiConfig;
    } catch (error) {
      throw new DatabaseError({ error, name: "Update API enrollment config" });
    }
  };

  const deleteById = async (id: string, tx?: Knex) => {
    try {
      const [apiConfig] = await (tx || db)(TableName.PkiApiEnrollmentConfig).where({ id }).del().returning("*");

      return apiConfig;
    } catch (error) {
      throw new DatabaseError({ error, name: "Delete API enrollment config" });
    }
  };

  const findById = async (id: string, tx?: Knex) => {
    try {
      const apiConfig = await (tx || db)(TableName.PkiApiEnrollmentConfig).where({ id }).first();

      return apiConfig;
    } catch (error) {
      throw new DatabaseError({ error, name: "Find API enrollment config by id" });
    }
  };

  const findProfilesForAutoRenewal = async (renewalThresholdDays: number = 30, tx?: Knex) => {
    try {
      const profiles = await (tx || db)(TableName.PkiCertificateProfile)
        .join(
          TableName.PkiApiEnrollmentConfig,
          `${TableName.PkiCertificateProfile}.apiConfigId`,
          `${TableName.PkiApiEnrollmentConfig}.id`
        )
        .where(`${TableName.PkiApiEnrollmentConfig}.autoRenew`, true)
        .where((query) => {
          void query.where((qb) => {
            void qb
              .whereNull(`${TableName.PkiApiEnrollmentConfig}.autoRenewDays`)
              .orWhere(`${TableName.PkiApiEnrollmentConfig}.autoRenewDays`, "<=", renewalThresholdDays);
          });
        })
        .select((tx || db).ref("id").withSchema(TableName.PkiCertificateProfile))
        .select((tx || db).ref("name").withSchema(TableName.PkiCertificateProfile))
        .select((tx || db).ref("projectId").withSchema(TableName.PkiCertificateProfile))
        .select((tx || db).ref("autoRenewDays").withSchema(TableName.PkiCertificateProfile));

      return profiles as Array<{ id: string; name: string; projectId: string; autoRenewDays?: number }>;
    } catch (error) {
      throw new DatabaseError({ error, name: "Find profiles for auto renewal" });
    }
  };

  const isConfigInUse = async (configId: string, tx?: Knex) => {
    try {
      const doc = await (tx || db)(TableName.PkiCertificateProfile).where({ apiConfigId: configId }).count("*").first();

      return parseInt((doc as { count?: string })?.count || "0", 10);
    } catch (error) {
      throw new DatabaseError({ error, name: "Check if API enrollment config is in use" });
    }
  };

  return {
    ...apiEnrollmentConfigOrm,
    create,
    updateById,
    deleteById,
    findById,
    findProfilesForAutoRenewal,
    isConfigInUse
  };
};
