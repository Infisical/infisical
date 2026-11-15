import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify } from "@app/lib/knex";
import {
  CRL_REBUILD_LEAD_HOURS_PER_VALIDITY_DAY,
  CRL_REBUILD_MAX_LEAD_HOURS,
  CRL_REVOCATION_CATCH_UP_MARGIN_MINUTES,
  CRL_VALIDITY_TOLERANCE_HOURS
} from "@app/services/certificate-common/certificate-constants";
import { CertStatus } from "@app/services/certificate/certificate-types";

export type TCertificateAuthorityCrlDALFactory = ReturnType<typeof certificateAuthorityCrlDALFactory>;

export const certificateAuthorityCrlDALFactory = (db: TDbClient) => {
  const caCrlOrm = ormify(db, TableName.CertificateAuthorityCrl);

  const findDueForRebuild = async ({
    afterId,
    limit
  }: {
    afterId?: string;
    limit: number;
  }): Promise<{ id: string; caId: string }[]> => {
    try {
      const query = db
        .replicaNode()(TableName.CertificateAuthorityCrl)
        .join(
          TableName.InternalCertificateAuthority,
          `${TableName.InternalCertificateAuthority}.caId`,
          `${TableName.CertificateAuthorityCrl}.caId`
        )
        .where((qb) => {
          void qb
            .whereNull(`${TableName.InternalCertificateAuthority}.notAfter`)
            .orWhere(`${TableName.InternalCertificateAuthority}.notAfter`, ">", db.fn.now());
        })
        .where((qb) => {
          void qb
            .where((dueQb) => {
              void dueQb
                .whereRaw(
                  `??.?? <= now() + LEAST(?::integer * interval '1 hour', ??.?? * ?::integer * interval '1 hour')`,
                  [
                    TableName.CertificateAuthorityCrl,
                    "nextUpdate",
                    CRL_REBUILD_MAX_LEAD_HOURS,
                    TableName.InternalCertificateAuthority,
                    "crlValidityDays",
                    CRL_REBUILD_LEAD_HOURS_PER_VALIDITY_DAY
                  ]
                )
                .where((notCappedQb) => {
                  void notCappedQb
                    .whereNull(`${TableName.InternalCertificateAuthority}.notAfter`)
                    .orWhere(
                      `${TableName.CertificateAuthorityCrl}.nextUpdate`,
                      "<",
                      db.ref(`${TableName.InternalCertificateAuthority}.notAfter`)
                    );
                });
            })
            .orWhere(
              `${TableName.CertificateAuthorityCrl}.nextUpdate`,
              ">",
              db.ref(`${TableName.InternalCertificateAuthority}.notAfter`)
            )
            .orWhereRaw(`??.?? > ??.?? + ??.?? * interval '1 day' + ?::integer * interval '1 hour'`, [
              TableName.CertificateAuthorityCrl,
              "nextUpdate",
              TableName.CertificateAuthorityCrl,
              "thisUpdate",
              TableName.InternalCertificateAuthority,
              "crlValidityDays",
              CRL_VALIDITY_TOLERANCE_HOURS
            ])
            .orWhereExists((revokedQb) => {
              void revokedQb
                .select(db.raw("1"))
                .from(TableName.Certificate)
                .whereRaw("??.?? = ??.??", [TableName.Certificate, "caId", TableName.CertificateAuthorityCrl, "caId"])
                .where(`${TableName.Certificate}.status`, CertStatus.REVOKED)
                .whereRaw("??.?? > ??.?? - ?::integer * interval '1 minute'", [
                  TableName.Certificate,
                  "revokedAt",
                  TableName.CertificateAuthorityCrl,
                  "thisUpdate",
                  CRL_REVOCATION_CATCH_UP_MARGIN_MINUTES
                ]);
            });
        })
        .select(
          db.ref("id").withSchema(TableName.CertificateAuthorityCrl),
          db.ref("caId").withSchema(TableName.CertificateAuthorityCrl)
        )
        .orderBy(`${TableName.CertificateAuthorityCrl}.id`, "asc")
        .limit(limit);

      if (afterId) void query.where(`${TableName.CertificateAuthorityCrl}.id`, ">", afterId);

      return await query;
    } catch (error) {
      throw new DatabaseError({ error, name: "FindCaCrlsDueForRebuild" });
    }
  };

  const primaryNode = () => db.primaryNode();

  return {
    ...caCrlOrm,
    findDueForRebuild,
    primaryNode
  };
};
