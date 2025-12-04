import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { CertificateAuthoritiesSchema, TableName, TCertificateAuthorities } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { buildFindFilter, ormify, selectAllTableCols, TFindOpt } from "@app/lib/knex";
import { applyPermissionFiltersToQuery, type PermissionFilters } from "@app/lib/knex/permission-filter-utils";

export type TCertificateAuthorityDALFactory = ReturnType<typeof certificateAuthorityDALFactory>;

export type TCertificateAuthorityWithAssociatedCa = Awaited<
  ReturnType<TCertificateAuthorityDALFactory["findByIdWithAssociatedCa"]>
>;

export const certificateAuthorityDALFactory = (db: TDbClient) => {
  const caOrm = ormify(db, TableName.CertificateAuthority);

  const findByNameAndProjectIdWithAssociatedCa = async (caName: string, projectId: string, tx?: Knex) => {
    const result = await (tx || db.replicaNode())(TableName.CertificateAuthority)
      .leftJoin(
        TableName.InternalCertificateAuthority,
        `${TableName.CertificateAuthority}.id`,
        `${TableName.InternalCertificateAuthority}.caId`
      )
      .leftJoin(
        TableName.ExternalCertificateAuthority,
        `${TableName.CertificateAuthority}.id`,
        `${TableName.ExternalCertificateAuthority}.caId`
      )
      .where(`${TableName.CertificateAuthority}.name`, caName)
      .where(`${TableName.CertificateAuthority}.projectId`, projectId)
      .select(selectAllTableCols(TableName.CertificateAuthority))
      .select(
        db.ref("id").withSchema(TableName.InternalCertificateAuthority).as("internalCaId"),
        db.ref("parentCaId").withSchema(TableName.InternalCertificateAuthority).as("internalParentCaId"),
        db.ref("type").withSchema(TableName.InternalCertificateAuthority).as("internalType"),
        db.ref("friendlyName").withSchema(TableName.InternalCertificateAuthority).as("internalFriendlyName"),
        db.ref("organization").withSchema(TableName.InternalCertificateAuthority).as("internalOrganization"),
        db.ref("ou").withSchema(TableName.InternalCertificateAuthority).as("internalOu"),
        db.ref("country").withSchema(TableName.InternalCertificateAuthority).as("internalCountry"),
        db.ref("province").withSchema(TableName.InternalCertificateAuthority).as("internalProvince"),
        db.ref("locality").withSchema(TableName.InternalCertificateAuthority).as("internalLocality"),
        db.ref("commonName").withSchema(TableName.InternalCertificateAuthority).as("internalCommonName"),
        db.ref("dn").withSchema(TableName.InternalCertificateAuthority).as("internalDn"),
        db.ref("serialNumber").withSchema(TableName.InternalCertificateAuthority).as("internalSerialNumber"),
        db.ref("maxPathLength").withSchema(TableName.InternalCertificateAuthority).as("internalMaxPathLength"),
        db.ref("keyAlgorithm").withSchema(TableName.InternalCertificateAuthority).as("internalKeyAlgorithm"),
        db.ref("notBefore").withSchema(TableName.InternalCertificateAuthority).as("internalNotBefore"),
        db.ref("notAfter").withSchema(TableName.InternalCertificateAuthority).as("internalNotAfter"),
        db.ref("activeCaCertId").withSchema(TableName.InternalCertificateAuthority).as("internalActiveCaCertId")
      )
      .select(
        db.ref("id").withSchema(TableName.ExternalCertificateAuthority).as("externalCaId"),
        db.ref("type").withSchema(TableName.ExternalCertificateAuthority).as("externalType"),
        db.ref("configuration").withSchema(TableName.ExternalCertificateAuthority).as("externalConfiguration"),
        db.ref("credentials").withSchema(TableName.ExternalCertificateAuthority).as("externalCredentials"),
        db
          .ref("dnsAppConnectionId")
          .withSchema(TableName.ExternalCertificateAuthority)
          .as("externalDnsAppConnectionId"),
        db.ref("appConnectionId").withSchema(TableName.ExternalCertificateAuthority).as("externalAppConnectionId")
      )
      .first();

    const data = {
      ...CertificateAuthoritiesSchema.parse(result),
      internalCa: result
        ? {
            id: result.internalCaId,
            parentCaId: result.internalParentCaId,
            type: result.internalType,
            friendlyName: result.internalFriendlyName,
            organization: result.internalOrganization,
            ou: result.internalOu,
            country: result.internalCountry,
            province: result.internalProvince,
            locality: result.internalLocality,
            commonName: result.internalCommonName,
            dn: result.internalDn,
            serialNumber: result.internalSerialNumber,
            maxPathLength: result.internalMaxPathLength,
            keyAlgorithm: result.internalKeyAlgorithm,
            notBefore: result.internalNotBefore?.toISOString(),
            notAfter: result.internalNotAfter?.toISOString(),
            activeCaCertId: result.internalActiveCaCertId
          }
        : undefined,
      externalCa: result
        ? {
            id: result.externalCaId,
            type: result.externalType,
            configuration: result.externalConfiguration,
            dnsAppConnectionId: result.externalDnsAppConnectionId,
            appConnectionId: result.externalAppConnectionId,
            credentials: result.externalCredentials
          }
        : undefined
    };

    return data;
  };

  const findByIdWithAssociatedCa = async (caId: string, tx?: Knex) => {
    const result = await (tx || db.replicaNode())(TableName.CertificateAuthority)
      .leftJoin(
        TableName.InternalCertificateAuthority,
        `${TableName.CertificateAuthority}.id`,
        `${TableName.InternalCertificateAuthority}.caId`
      )
      .leftJoin(
        TableName.ExternalCertificateAuthority,
        `${TableName.CertificateAuthority}.id`,
        `${TableName.ExternalCertificateAuthority}.caId`
      )
      .where(`${TableName.CertificateAuthority}.id`, caId)
      .select(selectAllTableCols(TableName.CertificateAuthority))
      .select(
        db.ref("id").withSchema(TableName.InternalCertificateAuthority).as("internalCaId"),
        db.ref("parentCaId").withSchema(TableName.InternalCertificateAuthority).as("internalParentCaId"),
        db.ref("type").withSchema(TableName.InternalCertificateAuthority).as("internalType"),
        db.ref("friendlyName").withSchema(TableName.InternalCertificateAuthority).as("internalFriendlyName"),
        db.ref("organization").withSchema(TableName.InternalCertificateAuthority).as("internalOrganization"),
        db.ref("ou").withSchema(TableName.InternalCertificateAuthority).as("internalOu"),
        db.ref("country").withSchema(TableName.InternalCertificateAuthority).as("internalCountry"),
        db.ref("province").withSchema(TableName.InternalCertificateAuthority).as("internalProvince"),
        db.ref("locality").withSchema(TableName.InternalCertificateAuthority).as("internalLocality"),
        db.ref("commonName").withSchema(TableName.InternalCertificateAuthority).as("internalCommonName"),
        db.ref("dn").withSchema(TableName.InternalCertificateAuthority).as("internalDn"),
        db.ref("serialNumber").withSchema(TableName.InternalCertificateAuthority).as("internalSerialNumber"),
        db.ref("maxPathLength").withSchema(TableName.InternalCertificateAuthority).as("internalMaxPathLength"),
        db.ref("keyAlgorithm").withSchema(TableName.InternalCertificateAuthority).as("internalKeyAlgorithm"),
        db.ref("notBefore").withSchema(TableName.InternalCertificateAuthority).as("internalNotBefore"),
        db.ref("notAfter").withSchema(TableName.InternalCertificateAuthority).as("internalNotAfter"),
        db.ref("activeCaCertId").withSchema(TableName.InternalCertificateAuthority).as("internalActiveCaCertId")
      )
      .select(
        db.ref("id").withSchema(TableName.ExternalCertificateAuthority).as("externalCaId"),
        db.ref("type").withSchema(TableName.ExternalCertificateAuthority).as("externalType"),
        db.ref("configuration").withSchema(TableName.ExternalCertificateAuthority).as("externalConfiguration"),
        db.ref("credentials").withSchema(TableName.ExternalCertificateAuthority).as("externalCredentials"),
        db
          .ref("dnsAppConnectionId")
          .withSchema(TableName.ExternalCertificateAuthority)
          .as("externalDnsAppConnectionId"),
        db.ref("appConnectionId").withSchema(TableName.ExternalCertificateAuthority).as("externalAppConnectionId")
      )
      .first();

    const data = {
      ...CertificateAuthoritiesSchema.parse(result),
      internalCa: result
        ? {
            id: result.internalCaId,
            parentCaId: result.internalParentCaId,
            type: result.internalType,
            friendlyName: result.internalFriendlyName,
            organization: result.internalOrganization,
            ou: result.internalOu,
            country: result.internalCountry,
            province: result.internalProvince,
            locality: result.internalLocality,
            commonName: result.internalCommonName,
            dn: result.internalDn,
            serialNumber: result.internalSerialNumber,
            maxPathLength: result.internalMaxPathLength,
            keyAlgorithm: result.internalKeyAlgorithm,
            notBefore: result.internalNotBefore?.toISOString(),
            notAfter: result.internalNotAfter?.toISOString(),
            activeCaCertId: result.internalActiveCaCertId
          }
        : undefined,
      externalCa: result
        ? {
            id: result.externalCaId,
            type: result.externalType,
            configuration: result.externalConfiguration,
            dnsAppConnectionId: result.externalDnsAppConnectionId,
            appConnectionId: result.externalAppConnectionId,
            credentials: result.externalCredentials
          }
        : undefined
    };

    return data;
  };

  // note: not used
  const buildCertificateChain = async (caId: string) => {
    try {
      const result: {
        caId: string;
        parentCaId?: string;
        encryptedCertificate: Buffer;
      }[] = await db
        .replicaNode()
        .withRecursive("cte", (cte) => {
          void cte
            .select("ca.id as caId", "ca.parentCaId", "cert.encryptedCertificate")
            .from({ ca: TableName.CertificateAuthority })
            .leftJoin({ cert: TableName.CertificateAuthorityCert }, "ca.id", "cert.caId")
            .where("ca.id", caId)
            .unionAll((builder) => {
              void builder
                .select("ca.id as caId", "ca.parentCaId", "cert.encryptedCertificate")
                .from({ ca: TableName.CertificateAuthority })
                .leftJoin({ cert: TableName.CertificateAuthorityCert }, "ca.id", "cert.caId")
                .innerJoin("cte", "cte.parentCaId", "ca.id");
            });
        })
        .select("*")
        .from("cte");

      // Extract certificates and reverse the order to have the root CA at the end
      const certChain: Buffer[] = result.map((row) => row.encryptedCertificate);
      return certChain;
    } catch (error) {
      throw new DatabaseError({ error, name: "BuildCertificateChain" });
    }
  };

  const findWithAssociatedCa = async (
    filter: Parameters<(typeof caOrm)["find"]>[0] & { dn?: string; type?: string; serialNumber?: string },
    { offset, limit, sort = [["createdAt", "desc"]] }: TFindOpt<TCertificateAuthorities> = {},
    permissionFilters?: PermissionFilters,
    tx?: Knex
  ) => {
    try {
      let query = (tx || db.replicaNode())(TableName.CertificateAuthority)
        .leftJoin(
          TableName.InternalCertificateAuthority,
          `${TableName.CertificateAuthority}.id`,
          `${TableName.InternalCertificateAuthority}.caId`
        )
        .leftJoin(
          TableName.ExternalCertificateAuthority,
          `${TableName.CertificateAuthority}.id`,
          `${TableName.ExternalCertificateAuthority}.caId`
        )
        // eslint-disable-next-line @typescript-eslint/no-misused-promises
        .where(buildFindFilter(filter))
        .select(selectAllTableCols(TableName.CertificateAuthority))
        .select(
          db.ref("id").withSchema(TableName.InternalCertificateAuthority).as("internalCaId"),
          db.ref("parentCaId").withSchema(TableName.InternalCertificateAuthority).as("internalParentCaId"),
          db.ref("type").withSchema(TableName.InternalCertificateAuthority).as("internalType"),
          db.ref("friendlyName").withSchema(TableName.InternalCertificateAuthority).as("internalFriendlyName"),
          db.ref("organization").withSchema(TableName.InternalCertificateAuthority).as("internalOrganization"),
          db.ref("ou").withSchema(TableName.InternalCertificateAuthority).as("internalOu"),
          db.ref("country").withSchema(TableName.InternalCertificateAuthority).as("internalCountry"),
          db.ref("province").withSchema(TableName.InternalCertificateAuthority).as("internalProvince"),
          db.ref("locality").withSchema(TableName.InternalCertificateAuthority).as("internalLocality"),
          db.ref("commonName").withSchema(TableName.InternalCertificateAuthority).as("internalCommonName"),
          db.ref("dn").withSchema(TableName.InternalCertificateAuthority).as("internalDn"),
          db.ref("serialNumber").withSchema(TableName.InternalCertificateAuthority).as("internalSerialNumber"),
          db.ref("maxPathLength").withSchema(TableName.InternalCertificateAuthority).as("internalMaxPathLength"),
          db.ref("keyAlgorithm").withSchema(TableName.InternalCertificateAuthority).as("internalKeyAlgorithm"),
          db.ref("notBefore").withSchema(TableName.InternalCertificateAuthority).as("internalNotBefore"),
          db.ref("notAfter").withSchema(TableName.InternalCertificateAuthority).as("internalNotAfter"),
          db.ref("activeCaCertId").withSchema(TableName.InternalCertificateAuthority).as("internalActiveCaCertId")
        )
        .select(
          db.ref("id").withSchema(TableName.ExternalCertificateAuthority).as("externalCaId"),
          db.ref("type").withSchema(TableName.ExternalCertificateAuthority).as("externalType"),
          db.ref("configuration").withSchema(TableName.ExternalCertificateAuthority).as("externalConfiguration"),
          db
            .ref("dnsAppConnectionId")
            .withSchema(TableName.ExternalCertificateAuthority)
            .as("externalDnsAppConnectionId"),
          db.ref("credentials").withSchema(TableName.ExternalCertificateAuthority).as("externalCredentials"),
          db.ref("appConnectionId").withSchema(TableName.ExternalCertificateAuthority).as("externalAppConnectionId")
        );

      if (permissionFilters) {
        query = applyPermissionFiltersToQuery(query, TableName.CertificateAuthority, permissionFilters) as typeof query;
      }

      if (limit) void query.limit(limit);
      if (offset) void query.offset(offset);
      if (sort) {
        void query.orderBy(
          sort.map(([column, order, nulls]) => ({
            column,
            order,
            nulls
          }))
        );
      }

      return (await query).map((ca) => ({
        ...CertificateAuthoritiesSchema.parse(ca),
        internalCa: ca
          ? {
              id: ca.internalCaId,
              parentCaId: ca.internalParentCaId,
              type: ca.internalType,
              friendlyName: ca.internalFriendlyName,
              organization: ca.internalOrganization,
              ou: ca.internalOu,
              country: ca.internalCountry,
              province: ca.internalProvince,
              locality: ca.internalLocality,
              commonName: ca.internalCommonName,
              dn: ca.internalDn,
              serialNumber: ca.internalSerialNumber,
              maxPathLength: ca.internalMaxPathLength,
              keyAlgorithm: ca.internalKeyAlgorithm,
              notBefore: ca.internalNotBefore?.toISOString(),
              notAfter: ca.internalNotAfter?.toISOString(),
              activeCaCertId: ca.internalActiveCaCertId
            }
          : undefined,
        externalCa: ca
          ? {
              id: ca.externalCaId,
              type: ca.externalType,
              configuration: ca.externalConfiguration,
              dnsAppConnectionId: ca.externalDnsAppConnectionId,
              appConnectionId: ca.externalAppConnectionId,
              credentials: ca.externalCredentials
            }
          : undefined
      }));
    } catch (error) {
      throw new DatabaseError({ error, name: "Find - Certificate Authority" });
    }
  };

  return {
    ...caOrm,
    findWithAssociatedCa,
    buildCertificateChain,
    findByIdWithAssociatedCa,
    findByNameAndProjectIdWithAssociatedCa
  };
};
