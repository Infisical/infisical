import { Knex } from "knex";
import { z } from "zod";

import { TDbClient } from "@app/db";
import { TableName, TPkiMicrosoftAutoenrollmentConfigs } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify, selectAllTableCols } from "@app/lib/knex";

const MicrosoftAutoenrollmentAllowedGroupsSchema = z.array(z.object({ sid: z.string(), name: z.string().nullable() }));

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

  const findByApplicationId = async (applicationId: string, tx?: Knex) => {
    try {
      const rows = await (tx || db.replicaNode())(TableName.PkiMicrosoftAutoenrollmentConfig)
        .innerJoin(
          TableName.PkiApplicationProfile,
          `${TableName.PkiMicrosoftAutoenrollmentConfig}.applicationProfileId`,
          `${TableName.PkiApplicationProfile}.id`
        )
        .innerJoin(
          TableName.PkiCertificateProfile,
          `${TableName.PkiApplicationProfile}.profileId`,
          `${TableName.PkiCertificateProfile}.id`
        )
        .where(`${TableName.PkiApplicationProfile}.applicationId`, applicationId)
        .select(
          selectAllTableCols(TableName.PkiMicrosoftAutoenrollmentConfig),
          db.ref("profileId").withSchema(TableName.PkiApplicationProfile),
          db.ref("slug").withSchema(TableName.PkiCertificateProfile).as("profileName")
        )
        .orderBy(`${TableName.PkiApplicationProfile}.createdAt`, "asc");

      return rows.map(withAllowedGroups);
    } catch (error) {
      throw new DatabaseError({ error, name: "Find Microsoft Autoenrollment configs by application" });
    }
  };

  const recordKeytabMismatch = async (configId: string, servicePrincipalName: string) => {
    try {
      await db(TableName.PkiMicrosoftAutoenrollmentConfig)
        .where({ id: configId })
        .update({
          mismatchedServicePrincipalName: servicePrincipalName,
          mismatchFirstSeenAt: db.raw(
            `CASE WHEN "mismatchedServicePrincipalName" IS NOT DISTINCT FROM ? THEN "mismatchFirstSeenAt" ELSE NOW() END`,
            [servicePrincipalName]
          ),
          mismatchRequestCount: db.raw(
            `CASE WHEN "mismatchedServicePrincipalName" IS NOT DISTINCT FROM ? THEN "mismatchRequestCount" + 1 ELSE 1 END`,
            [servicePrincipalName]
          )
        } as never);
    } catch (error) {
      throw new DatabaseError({ error, name: "Record Microsoft Autoenrollment keytab mismatch" });
    }
  };

  const primaryNode = () => db.primaryNode();

  return {
    ...microsoftAutoenrollmentConfigOrm,
    primaryNode,
    findById,
    findByApplicationId,
    recordKeytabMismatch
  };
};
