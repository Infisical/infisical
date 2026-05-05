import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify } from "@app/lib/knex";

import { TPkiApplicationProfile } from "./pki-application-types";

export type TPkiApplicationProfileDALFactory = ReturnType<typeof pkiApplicationProfileDALFactory>;

export const pkiApplicationProfileDALFactory = (db: TDbClient) => {
  const orm = ormify(db, TableName.PkiApplicationProfile);

  const findByApplicationId = async (applicationId: string, tx?: Knex): Promise<TPkiApplicationProfile[]> => {
    try {
      const rows = await (tx || db.replicaNode())(TableName.PkiApplicationProfile)
        .innerJoin(
          TableName.PkiCertificateProfile,
          `${TableName.PkiApplicationProfile}.profileId`,
          `${TableName.PkiCertificateProfile}.id`
        )
        .where(`${TableName.PkiApplicationProfile}.applicationId`, applicationId)
        .select(
          `${TableName.PkiApplicationProfile}.applicationId`,
          `${TableName.PkiApplicationProfile}.profileId`,
          `${TableName.PkiCertificateProfile}.slug as profileSlug`,
          `${TableName.PkiCertificateProfile}.description as profileDescription`,
          `${TableName.PkiApplicationProfile}.estConfigId`,
          `${TableName.PkiApplicationProfile}.apiConfigId`,
          `${TableName.PkiApplicationProfile}.acmeConfigId`,
          `${TableName.PkiApplicationProfile}.scepConfigId`,
          `${TableName.PkiApplicationProfile}.createdAt`,
          `${TableName.PkiApplicationProfile}.updatedAt`
        )
        .orderBy(`${TableName.PkiApplicationProfile}.createdAt`, "desc");

      return rows as TPkiApplicationProfile[];
    } catch (error) {
      throw new DatabaseError({ error, name: "List application profiles" });
    }
  };

  const findOne = async (applicationId: string, profileId: string, tx?: Knex) => {
    try {
      const row = await (tx || db.replicaNode())(TableName.PkiApplicationProfile)
        .where({ applicationId, profileId })
        .first();
      return row;
    } catch (error) {
      throw new DatabaseError({ error, name: "Find application profile" });
    }
  };

  const findProfilesInProject = async (profileIds: string[], projectId: string, tx?: Knex) => {
    try {
      const rows = await (tx || db.replicaNode())(TableName.PkiCertificateProfile)
        .whereIn("id", profileIds)
        .andWhere({ projectId });
      return rows;
    } catch (error) {
      throw new DatabaseError({ error, name: "Find profiles in project" });
    }
  };

  const findByProfileId = async (profileId: string, tx?: Knex) => {
    try {
      const row = await (tx || db.replicaNode())(TableName.PkiApplicationProfile).where({ profileId }).first();
      return row;
    } catch (error) {
      throw new DatabaseError({ error, name: "Find application junction by profile" });
    }
  };

  const findAllByProfileId = async (profileId: string, tx?: Knex) => {
    try {
      const rows = await (tx || db.replicaNode())(TableName.PkiApplicationProfile).where({ profileId });
      return rows as Array<{
        applicationId: string;
        profileId: string;
        apiConfigId?: string | null;
        estConfigId?: string | null;
        acmeConfigId?: string | null;
        scepConfigId?: string | null;
      }>;
    } catch (error) {
      throw new DatabaseError({ error, name: "Find all application junctions for profile" });
    }
  };

  return {
    ...orm,
    findAllByProfileId,
    findByApplicationId,
    findOne,
    findProfilesInProject,
    findByProfileId
  };
};
