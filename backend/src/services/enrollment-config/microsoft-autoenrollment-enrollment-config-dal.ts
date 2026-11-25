import { Knex } from "knex";
import { z } from "zod";

import { TDbClient } from "@app/db";
import { TableName, TPkiMicrosoftAutoenrollmentConfigs } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify } from "@app/lib/knex";

const MicrosoftAutoenrollmentAllowedGroupsSchema = z.array(z.object({ sid: z.string(), name: z.string() }));

export type TMicrosoftAutoenrollmentAllowedGroup = z.infer<typeof MicrosoftAutoenrollmentAllowedGroupsSchema>[number];

const withAllowedGroups = <T extends Pick<TPkiMicrosoftAutoenrollmentConfigs, "allowedGroups">>(row: T) => ({
  ...row,
  allowedGroups: MicrosoftAutoenrollmentAllowedGroupsSchema.parse(row.allowedGroups ?? [])
});

export type TMicrosoftAutoenrollmentEnrollmentConfigDALFactory = ReturnType<
  typeof microsoftAutoenrollmentEnrollmentConfigDALFactory
>;

export const microsoftAutoenrollmentEnrollmentConfigDALFactory = (db: TDbClient) => {
  const microsoftAutoenrollmentConfigOrm = ormify(db, TableName.PkiMicrosoftAutoenrollmentConfig);

  const findById = async (id: string, tx?: Knex) => {
    const row = await microsoftAutoenrollmentConfigOrm.findById(id, tx);
    if (!row) return row;
    return withAllowedGroups(row);
  };

  const $findApplicationConfigs = (applicationId: string, tx?: Knex) =>
    (tx || db.replicaNode())(TableName.PkiApplicationProfile)
      .innerJoin(
        TableName.PkiMicrosoftAutoenrollmentConfig,
        `${TableName.PkiApplicationProfile}.microsoftAutoenrollmentConfigId`,
        `${TableName.PkiMicrosoftAutoenrollmentConfig}.id`
      )
      .innerJoin(
        TableName.PkiCertificateProfile,
        `${TableName.PkiApplicationProfile}.profileId`,
        `${TableName.PkiCertificateProfile}.id`
      )
      .where(`${TableName.PkiApplicationProfile}.applicationId`, applicationId);

  const findByApplicationId = async (applicationId: string, tx?: Knex) => {
    try {
      const rows = await $findApplicationConfigs(applicationId, tx)
        .select(
          db.ref("id").withSchema(TableName.PkiMicrosoftAutoenrollmentConfig),
          db.ref("servicePrincipalName").withSchema(TableName.PkiMicrosoftAutoenrollmentConfig),
          db.ref("keyVersion").withSchema(TableName.PkiMicrosoftAutoenrollmentConfig),
          db.ref("appConnectionId").withSchema(TableName.PkiMicrosoftAutoenrollmentConfig),
          db.ref("profileId").withSchema(TableName.PkiApplicationProfile),
          db.ref("slug").withSchema(TableName.PkiCertificateProfile).as("profileName")
        )
        .orderBy(`${TableName.PkiApplicationProfile}.createdAt`, "asc");

      return rows as (Pick<
        TPkiMicrosoftAutoenrollmentConfigs,
        "id" | "servicePrincipalName" | "keyVersion" | "appConnectionId"
      > & { profileId: string; profileName: string })[];
    } catch (error) {
      throw new DatabaseError({ error, name: "Find Microsoft Autoenrollment configs by application" });
    }
  };

  const findKeytabByApplicationAndProfile = async (applicationId: string, profileId: string, tx?: Knex) => {
    try {
      const row = await $findApplicationConfigs(applicationId, tx)
        .where(`${TableName.PkiApplicationProfile}.profileId`, profileId)
        .first(
          db.ref("encryptedKeytab").withSchema(TableName.PkiMicrosoftAutoenrollmentConfig),
          db.ref("servicePrincipalName").withSchema(TableName.PkiMicrosoftAutoenrollmentConfig),
          db.ref("keyVersion").withSchema(TableName.PkiMicrosoftAutoenrollmentConfig),
          db.ref("profileId").withSchema(TableName.PkiApplicationProfile),
          db.ref("slug").withSchema(TableName.PkiCertificateProfile).as("profileName")
        );

      return row as
        | (Pick<TPkiMicrosoftAutoenrollmentConfigs, "encryptedKeytab" | "servicePrincipalName" | "keyVersion"> & {
            profileId: string;
            profileName: string;
          })
        | undefined;
    } catch (error) {
      throw new DatabaseError({ error, name: "Find Microsoft Autoenrollment keytab by application and profile" });
    }
  };

  const primaryNode = () => db.primaryNode();

  return {
    ...microsoftAutoenrollmentConfigOrm,
    primaryNode,
    findById,
    findByApplicationId,
    findKeytabByApplicationAndProfile
  };
};
