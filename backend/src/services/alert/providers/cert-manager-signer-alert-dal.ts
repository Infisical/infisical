import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { SignerStatus } from "@app/services/signer/signer-enums";

import { scanExpiringCertificates, TExpiringCertificatesScan } from "./cert-manager-expiring-certificates-fns";

export type TCertManagerSignerAlertDALFactory = ReturnType<typeof certManagerSignerAlertDALFactory>;

export type TSignerAlertCertificate = {
  id: string;
  serialNumber: string;
  commonName: string;
  altNames: string | null;
  status: string;
  notBefore: Date;
  notAfter: Date;
  signerIds: string[];
  signerNames: string[];
};

export const certManagerSignerAlertDALFactory = (db: TDbClient) => {
  const $selectSignerCertificates = (reader: Knex, projectId: string, signerIds?: string[]) =>
    reader(TableName.Certificate)
      .join(
        reader(TableName.PkiSigners)
          .where(`${TableName.PkiSigners}.projectId`, projectId)
          .where(`${TableName.PkiSigners}.status`, SignerStatus.Active)
          .whereNotNull(`${TableName.PkiSigners}.certificateId`)
          .modify((query) => {
            if (signerIds?.length) void query.whereIn(`${TableName.PkiSigners}.id`, signerIds);
          })
          .groupBy(`${TableName.PkiSigners}.certificateId`)
          .select(`${TableName.PkiSigners}.certificateId`)
          .select(
            reader.raw(
              `array_agg("${TableName.PkiSigners}".id order by "${TableName.PkiSigners}".name) as "signerIds"`
            ),
            reader.raw(
              `array_agg("${TableName.PkiSigners}".name order by "${TableName.PkiSigners}".name) as "signerNames"`
            )
          )
          .as("signers"),
        "signers.certificateId",
        `${TableName.Certificate}.id`
      )
      .select(
        `${TableName.Certificate}.id`,
        `${TableName.Certificate}.serialNumber`,
        `${TableName.Certificate}.commonName`,
        `${TableName.Certificate}.altNames`,
        `${TableName.Certificate}.status`,
        `${TableName.Certificate}.notBefore`,
        `${TableName.Certificate}.notAfter`,
        "signers.signerIds",
        "signers.signerNames"
      );

  const findExpiringSignerCertificates = async (
    scope: { projectId: string; signerIds?: string[] } & TExpiringCertificatesScan,
    tx?: Knex
  ): Promise<TSignerAlertCertificate[]> => {
    try {
      const reader = tx || db.replicaNode();
      return await scanExpiringCertificates<TSignerAlertCertificate>(
        reader,
        () => $selectSignerCertificates(reader, scope.projectId, scope.signerIds),
        scope
      );
    } catch (error) {
      throw new DatabaseError({ error, name: "FindExpiringSignerCertificates" });
    }
  };

  const findProjectSignerIds = async (projectId: string, signerIds: string[], tx?: Knex) => {
    try {
      return (await (tx || db)(TableName.PkiSigners)
        .where({ projectId })
        .whereIn("id", signerIds)
        .pluck("id")) as string[];
    } catch (error) {
      throw new DatabaseError({ error, name: "FindProjectSignerIds" });
    }
  };

  const findSignerNamesByIds = async (projectId: string, signerIds: string[]) => {
    if (signerIds.length === 0) return [];
    try {
      return (await db
        .replicaNode()(TableName.PkiSigners)
        .where({ projectId })
        .whereIn("id", signerIds)
        .select("id", "name")) as { id: string; name: string }[];
    } catch (error) {
      throw new DatabaseError({ error, name: "FindSignerNamesByIds" });
    }
  };

  return { findExpiringSignerCertificates, findProjectSignerIds, findSignerNamesByIds };
};
