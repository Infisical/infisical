import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName, TPkiCertificateInstallations } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify, selectAllTableCols } from "@app/lib/knex";

export type TPkiCertificateInstallationDALFactory = ReturnType<typeof pkiCertificateInstallationDALFactory>;

export const pkiCertificateInstallationDALFactory = (db: TDbClient) => {
  const pkiCertificateInstallationOrm = ormify(db, TableName.PkiCertificateInstallation);

  const findByProjectId = async (
    projectId: string,
    {
      offset = 0,
      limit = 25,
      discoveryId,
      certificateId,
      search,
      tx
    }: {
      offset?: number;
      limit?: number;
      discoveryId?: string;
      certificateId?: string;
      search?: string;
      tx?: Knex;
    } = {}
  ) => {
    try {
      const knex = tx || db.replicaNode();

      const query: Knex.QueryBuilder = knex(TableName.PkiCertificateInstallation)
        .select(selectAllTableCols(TableName.PkiCertificateInstallation))
        .select(
          knex.raw(`(?)::int as "certificatesCount"`, [
            knex(TableName.PkiCertificateInstallationCert)
              .count("*")
              .where(
                `${TableName.PkiCertificateInstallationCert}.installationId`,
                knex.ref(`${TableName.PkiCertificateInstallation}.id`)
              )
          ])
        )
        .select(
          knex.raw(`(?) as "primaryCertName"`, [
            knex(TableName.PkiCertificateInstallationCert)
              .select(`${TableName.Certificate}.commonName`)
              .join(
                TableName.Certificate,
                `${TableName.PkiCertificateInstallationCert}.certificateId`,
                `${TableName.Certificate}.id`
              )
              .where(
                `${TableName.PkiCertificateInstallationCert}.installationId`,
                knex.ref(`${TableName.PkiCertificateInstallation}.id`)
              )
              .orderBy(`${TableName.PkiCertificateInstallationCert}.lastSeenAt`, "desc")
              .limit(1)
          ])
        )
        .select(
          knex.raw(`(?) as "discoveryName"`, [
            knex(TableName.PkiDiscoveryInstallation)
              .select(`${TableName.PkiDiscoveryConfig}.name`)
              .join(
                TableName.PkiDiscoveryConfig,
                `${TableName.PkiDiscoveryInstallation}.discoveryId`,
                `${TableName.PkiDiscoveryConfig}.id`
              )
              .where(
                `${TableName.PkiDiscoveryInstallation}.installationId`,
                knex.ref(`${TableName.PkiCertificateInstallation}.id`)
              )
              .orderBy(`${TableName.PkiDiscoveryInstallation}.lastScannedAt`, "desc")
              .limit(1)
          ])
        )
        .where(`${TableName.PkiCertificateInstallation}.projectId`, projectId);

      if (discoveryId) {
        void query
          .join(
            TableName.PkiDiscoveryInstallation,
            `${TableName.PkiCertificateInstallation}.id`,
            `${TableName.PkiDiscoveryInstallation}.installationId`
          )
          .where(`${TableName.PkiDiscoveryInstallation}.discoveryId`, discoveryId);
      }

      if (certificateId) {
        void query
          .join(
            `${TableName.PkiCertificateInstallationCert} as cert_filter`,
            `${TableName.PkiCertificateInstallation}.id`,
            "cert_filter.installationId"
          )
          .where("cert_filter.certificateId", certificateId);
      }

      if (search) {
        void query.andWhere((qb: Knex.QueryBuilder) => {
          void qb
            .whereILike(`${TableName.PkiCertificateInstallation}.name`, `%${search}%`)
            .orWhereRaw(`"${TableName.PkiCertificateInstallation}"."locationDetails"->>'hostname' ILIKE ?`, [
              `%${search}%`
            ])
            .orWhereRaw(`"${TableName.PkiCertificateInstallation}"."locationDetails"->>'ipAddress' ILIKE ?`, [
              `%${search}%`
            ]);
        });
      }

      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const docs = await query
        .orderBy(`${TableName.PkiCertificateInstallation}.lastSeenAt`, "desc")
        .offset(offset)
        .limit(limit);

      return docs as (TPkiCertificateInstallations & {
        certificatesCount: number;
        primaryCertName: string | null;
        discoveryName: string | null;
      })[];
    } catch (error) {
      throw new DatabaseError({ error, name: "Find PKI certificate installations by project ID" });
    }
  };

  const countByProjectId = async (
    projectId: string,
    {
      discoveryId,
      certificateId,
      search,
      tx
    }: { discoveryId?: string; certificateId?: string; search?: string; tx?: Knex } = {}
  ): Promise<number> => {
    try {
      const knex = tx || db.replicaNode();

      const query: Knex.QueryBuilder = knex(TableName.PkiCertificateInstallation).where(
        `${TableName.PkiCertificateInstallation}.projectId`,
        projectId
      );

      if (discoveryId) {
        void query
          .join(
            TableName.PkiDiscoveryInstallation,
            `${TableName.PkiCertificateInstallation}.id`,
            `${TableName.PkiDiscoveryInstallation}.installationId`
          )
          .where(`${TableName.PkiDiscoveryInstallation}.discoveryId`, discoveryId);
      }

      if (certificateId) {
        void query
          .join(
            `${TableName.PkiCertificateInstallationCert} as cert_filter`,
            `${TableName.PkiCertificateInstallation}.id`,
            "cert_filter.installationId"
          )
          .where("cert_filter.certificateId", certificateId);
      }

      if (search) {
        void query.andWhere((qb: Knex.QueryBuilder) => {
          void qb
            .whereILike(`${TableName.PkiCertificateInstallation}.name`, `%${search}%`)
            .orWhereRaw(`"${TableName.PkiCertificateInstallation}"."locationDetails"->>'hostname' ILIKE ?`, [
              `%${search}%`
            ])
            .orWhereRaw(`"${TableName.PkiCertificateInstallation}"."locationDetails"->>'ipAddress' ILIKE ?`, [
              `%${search}%`
            ]);
        });
      }

      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const result = await query.count("*").first();
      return parseInt(String((result as { count?: string | number })?.count || "0"), 10);
    } catch (error) {
      throw new DatabaseError({ error, name: "Count PKI certificate installations by project ID" });
    }
  };

  const findByIdWithCertificates = async (id: string, { tx }: { tx?: Knex } = {}) => {
    try {
      const knex = tx || db.replicaNode();

      const installation = (await knex(TableName.PkiCertificateInstallation)
        .select(selectAllTableCols(TableName.PkiCertificateInstallation))
        .select(
          knex.raw(`(?) as "discoveryName"`, [
            knex(TableName.PkiDiscoveryInstallation)
              .select(`${TableName.PkiDiscoveryConfig}.name`)
              .join(
                TableName.PkiDiscoveryConfig,
                `${TableName.PkiDiscoveryInstallation}.discoveryId`,
                `${TableName.PkiDiscoveryConfig}.id`
              )
              .where(
                `${TableName.PkiDiscoveryInstallation}.installationId`,
                knex.ref(`${TableName.PkiCertificateInstallation}.id`)
              )
              .orderBy(`${TableName.PkiDiscoveryInstallation}.lastScannedAt`, "desc")
              .limit(1)
          ])
        )
        .where(`${TableName.PkiCertificateInstallation}.id`, id)
        .first()) as (TPkiCertificateInstallations & { discoveryName: string | null }) | undefined;

      if (!installation) return null;

      const certLinks = await (tx || db.replicaNode())(TableName.PkiCertificateInstallationCert)
        .select(
          selectAllTableCols(TableName.PkiCertificateInstallationCert),
          `${TableName.Certificate}.commonName`,
          `${TableName.Certificate}.serialNumber`,
          `${TableName.Certificate}.notBefore`,
          `${TableName.Certificate}.notAfter`,
          `${TableName.Certificate}.status`,
          `${TableName.Certificate}.friendlyName`,
          `${TableName.Certificate}.fingerprintSha256`
        )
        .join(
          TableName.Certificate,
          `${TableName.PkiCertificateInstallationCert}.certificateId`,
          `${TableName.Certificate}.id`
        )
        .where(`${TableName.PkiCertificateInstallationCert}.installationId`, id)
        .orderBy(`${TableName.PkiCertificateInstallationCert}.lastSeenAt`, "desc");

      return {
        ...installation,
        certificates: certLinks
      };
    } catch (error) {
      throw new DatabaseError({ error, name: "Find PKI certificate installation by ID with certificates" });
    }
  };

  const findByCertificateId = async (certificateId: string, { tx }: { tx?: Knex } = {}) => {
    try {
      const knex = tx || db.replicaNode();

      const docs = await knex(TableName.PkiCertificateInstallation)
        .select(selectAllTableCols(TableName.PkiCertificateInstallation))
        .join(
          TableName.PkiCertificateInstallationCert,
          `${TableName.PkiCertificateInstallation}.id`,
          `${TableName.PkiCertificateInstallationCert}.installationId`
        )
        .where(`${TableName.PkiCertificateInstallationCert}.certificateId`, certificateId)
        .orderBy(`${TableName.PkiCertificateInstallation}.lastSeenAt`, "desc");

      return docs as TPkiCertificateInstallations[];
    } catch (error) {
      throw new DatabaseError({ error, name: "Find PKI certificate installations by certificate ID" });
    }
  };

  const findByFingerprint = async (
    projectId: string,
    locationFingerprint: string,
    tx?: Knex
  ): Promise<TPkiCertificateInstallations | undefined> => {
    try {
      const doc = await (tx || db.replicaNode())<TPkiCertificateInstallations>(TableName.PkiCertificateInstallation)
        .where({ projectId, locationFingerprint })
        .first();

      return doc;
    } catch (error) {
      throw new DatabaseError({ error, name: "Find PKI certificate installation by fingerprint" });
    }
  };

  return {
    ...pkiCertificateInstallationOrm,
    findByProjectId,
    countByProjectId,
    findByIdWithCertificates,
    findByCertificateId,
    findByFingerprint
  };
};
