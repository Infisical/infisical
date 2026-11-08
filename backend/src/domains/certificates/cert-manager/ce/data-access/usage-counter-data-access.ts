import { Knex } from "knex";

import { ProjectType, TableName } from "@app/db/schemas";
import { DataAccessDb, TReadOptions } from "@app/domains/lib/data-access-db";
import { CertificateSource } from "@app/ee/services/pki-discovery/pki-discovery-types";
import { DatabaseError } from "@app/lib/errors";
import { orgTreeIds } from "@app/lib/knex";
import { CertStatus } from "@app/services/certificate/certificate-types";

// A metered PKI unit count for one org in the tree. Certificates carry no per-project attribution here
// because the meter dedupes by quotaKey across the whole tree (see getActiveCertificateOrgBreakdown).
export type TOrgUnitCountRow = { orgId: string; count: number };

// Active certificates for one org, with the wildcard subset that active_certs and wildcard_certs both
// read, so the two meters can never disagree about which certificates are live.
export type TCertificateOrgUnitRow = TOrgUnitCountRow & { wildcard: number };

export type TPkiRootOrgUsageRow = {
  rootOrgId: string;
  cas: number;
  internalCas: number;
  activeCertificates: number;
  wildcardCertificates: number;
};

const toCount = (row: unknown): number => Number((row as { count?: string | number } | undefined)?.count ?? 0);

// orgId omitted means instance-wide: self-hosted is one licence over the whole database and reports
// under an identity that is not an org id, so the org filter has to come off rather than be handed a
// non-uuid.
const internalCasQuery = (db: Knex, orgId?: string) => {
  const qb = db(TableName.CertificateAuthority)
    .join(
      TableName.InternalCertificateAuthority,
      `${TableName.CertificateAuthority}.id`,
      `${TableName.InternalCertificateAuthority}.caId`
    )
    .join(TableName.Project, `${TableName.CertificateAuthority}.projectId`, `${TableName.Project}.id`)
    .whereNull(`${TableName.Project}.deleteAfter`);

  if (orgId) void qb.whereIn(`${TableName.Project}.orgId`, orgTreeIds(db, orgId));

  return qb;
};

// Code signing is licensed separately, so signer certificates are excluded. Anchored on the signer
// rather than on the code_signing EKU: that usage is caller-supplied, so a tenant could append it to
// every request and escape the quota entirely.
//
// Matched on quotaKey rather than on pki_signers.certificateId, which points only at a signer's
// current certificate. Every certificate a signer issues carries the signer's commonName, so the
// whole renewal chain shares one quotaKey and this covers it without a schema change.
const excludeSignerCertificates = (db: Knex, qb: Knex.QueryBuilder) => {
  return qb.whereNotExists((sub) => {
    void sub
      .select(db.raw("1"))
      .from(`${TableName.PkiSigners} as s`)
      .join(`${TableName.Certificate} as sc`, "sc.id", "s.certificateId")
      .whereRaw(`sc."quotaKey" = ??`, [`${TableName.Certificate}.quotaKey`])
      // Same project, so one tenant cannot exempt a certificate by matching another's signer names.
      .whereRaw(`s."projectId" = ??`, [`${TableName.Certificate}.projectId`]);
  });
};

// No `status = 'active'` filter: nothing writes EXPIRED or RENEWED, both are derived at read time.
// orgId omitted means instance-wide; see countInternalCas.
const activeQuotaCertificates = (db: Knex, orgId?: string) => {
  const qb = db(TableName.Certificate)
    .join(TableName.Project, `${TableName.Certificate}.projectId`, `${TableName.Project}.id`)
    .whereNull(`${TableName.Project}.deleteAfter`)
    .where(`${TableName.Certificate}.notAfter`, ">", new Date())
    .whereNot(`${TableName.Certificate}.status`, CertStatus.REVOKED)
    .where((liveOrIssued) => {
      void liveOrIssued
        .whereNull(`${TableName.Certificate}.deletedAt`)
        .orWhereNull(`${TableName.Certificate}.source`)
        .orWhereNotIn(`${TableName.Certificate}.source`, [CertificateSource.Imported, CertificateSource.Discovered]);
    });

  if (orgId) void qb.whereIn(`${TableName.Project}.orgId`, orgTreeIds(db, orgId));

  return excludeSignerCertificates(db, qb);
};

// Reads tables this domain will own once certificate issuance moves in: certificate_authorities,
// internal_certificate_authorities, certificates and pki_signers (see ../../AGENTS.md).
export class CertificateUsageDataAccess {
  constructor(private readonly db: DataAccessDb) {}

  async countInternalCas(orgId?: string, options?: TReadOptions): Promise<number> {
    const db = this.db.reader(options);
    try {
      const row = await internalCasQuery(db, orgId).count(`${TableName.CertificateAuthority}.id as count`).first();
      return toCount(row);
    } catch (error) {
      throw new DatabaseError({ error, name: "Count internal CAs for usage" });
    }
  }

  // Joins on projectId rather than caId, which is nullable and would drop imported and discovered
  // certificates. Both counts read hasWildcard from the covering index; filtering with LIKE over
  // commonName/altNames instead forces a sequential scan (measured: ~2x at 600k rows).
  async countActiveCertificateQuotaKeys(
    orgId?: string,
    options?: TReadOptions
  ): Promise<{ total: number; wildcard: number }> {
    const db = this.db.reader(options);
    try {
      const row = (await activeQuotaCertificates(db, orgId)
        .countDistinct(`${TableName.Certificate}.quotaKey as total`)
        .select(
          db.raw(`COUNT(DISTINCT ??) FILTER (WHERE ??) as "wildcard"`, [
            `${TableName.Certificate}.quotaKey`,
            `${TableName.Certificate}.hasWildcard`
          ])
        )
        .first()) as { total?: string | number; wildcard?: string | number } | undefined;

      return { total: Number(row?.total ?? 0), wildcard: Number(row?.wildcard ?? 0) };
    } catch (error) {
      throw new DatabaseError({ error, name: "Count active certificate quota keys for org" });
    }
  }

  // Lets an org at its cap keep renewing: reissuing names it already holds cannot raise the count.
  // orgId omitted means instance-wide
  async isCertificateQuotaKeyActive(
    orgId: string | undefined,
    quotaKey: string,
    options?: TReadOptions
  ): Promise<boolean> {
    const db = this.db.reader(options);
    try {
      const row = (await activeQuotaCertificates(db, orgId)
        .where(`${TableName.Certificate}.quotaKey`, quotaKey)
        .select(`${TableName.Certificate}.id`)
        .first()) as { id?: string } | undefined;
      return Boolean(row);
    } catch (error) {
      throw new DatabaseError({ error, name: "Check certificate quota key active for org" });
    }
  }

  async getInternalCaOrgBreakdown(orgId?: string, options?: TReadOptions): Promise<TOrgUnitCountRow[]> {
    const db = this.db.reader(options);
    try {
      const rows = (await internalCasQuery(db, orgId)
        .groupBy(`${TableName.Project}.orgId`)
        .select({ orgId: `${TableName.Project}.orgId` })
        .count(`${TableName.CertificateAuthority}.id as count`)) as {
        orgId: string;
        count: string | number;
      }[];

      return rows.map((row) => ({ orgId: row.orgId, count: Number(row.count) }));
    } catch (error) {
      throw new DatabaseError({ error, name: "Get internal CA breakdown for usage" });
    }
  }

  // The meter counts DISTINCT quotaKey across the whole org tree, so one certificate name issued in two
  // orgs is a single billable unit. Splitting that by org therefore needs each quotaKey attributed to
  // exactly one of them, else the parts sum past the billed total. The earliest issuance wins (org id
  // breaks a tie) so the attribution is stable between reads rather than shifting with row order.
  async getActiveCertificateOrgBreakdown(orgId?: string, options?: TReadOptions): Promise<TCertificateOrgUnitRow[]> {
    const db = this.db.reader(options);
    try {
      const attributed = activeQuotaCertificates(db, orgId)
        .whereNotNull(`${TableName.Certificate}.quotaKey`)
        .distinctOn(`${TableName.Certificate}.quotaKey`)
        .orderBy([
          { column: `${TableName.Certificate}.quotaKey` },
          { column: `${TableName.Certificate}.notBefore`, order: "asc" },
          { column: `${TableName.Project}.orgId`, order: "asc" }
        ])
        .select({
          quotaKey: `${TableName.Certificate}.quotaKey`,
          orgId: `${TableName.Project}.orgId`
        })
        // For each certificate row, it looks at all rows with the same quotaKey and sets hasWildcard to true if any of them is wildcard.
        .select(
          db.raw(`bool_or(??) OVER (PARTITION BY ??) as "hasWildcard"`, [
            `${TableName.Certificate}.hasWildcard`,
            `${TableName.Certificate}.quotaKey`
          ])
        );

      const rows = (await db
        .from(attributed.as("attributed"))
        .groupBy("attributed.orgId")
        .select({ orgId: "attributed.orgId" })
        .count("* as total")
        .select(db.raw(`COUNT(*) FILTER (WHERE attributed."hasWildcard") as "wildcard"`))) as {
        orgId: string;
        total: string | number;
        wildcard: string | number;
      }[];

      return rows.map((row) => ({
        orgId: row.orgId,
        count: Number(row.total),
        wildcard: Number(row.wildcard)
      }));
    } catch (error) {
      throw new DatabaseError({ error, name: "Get active certificate breakdown for usage" });
    }
  }

  // Orgs with a Certificate Manager project are included even at zero, so one that stops using PKI is
  // overwritten with zeros rather than keeping stale counts. The last such project cannot be deleted.
  async getPkiUsageByRootOrg(options?: TReadOptions): Promise<TPkiRootOrgUsageRow[]> {
    const db = this.db.reader(options);
    const orgColumns = [`${TableName.Organization}.rootOrgId`, `${TableName.Organization}.id`];
    const rootOrgIdSql = db.raw(`COALESCE(??, ??)`, orgColumns);
    const rootOrgIdSelect = db.raw(`COALESCE(??, ??) as "rootOrgId"`, orgColumns);

    try {
      const caRows = (await db(TableName.CertificateAuthority)
        .join(TableName.Project, `${TableName.CertificateAuthority}.projectId`, `${TableName.Project}.id`)
        .join(TableName.Organization, `${TableName.Project}.orgId`, `${TableName.Organization}.id`)
        .leftJoin(
          TableName.InternalCertificateAuthority,
          `${TableName.CertificateAuthority}.id`,
          `${TableName.InternalCertificateAuthority}.caId`
        )
        .whereNull(`${TableName.Project}.deleteAfter`)
        .groupBy(rootOrgIdSql)
        .select(rootOrgIdSelect)
        .countDistinct(`${TableName.CertificateAuthority}.id as cas`)
        .countDistinct(`${TableName.InternalCertificateAuthority}.caId as internalCas`)) as {
        rootOrgId: string;
        cas: string | number;
        internalCas: string | number;
      }[];

      const activeCertificateRows = (await activeQuotaCertificates(db)
        .join(TableName.Organization, `${TableName.Project}.orgId`, `${TableName.Organization}.id`)
        .groupBy(rootOrgIdSql)
        .select(rootOrgIdSelect)
        .countDistinct(`${TableName.Certificate}.quotaKey as activeCertificates`)
        .select(
          db.raw(`COUNT(DISTINCT ??) FILTER (WHERE ??) as "wildcardCertificates"`, [
            `${TableName.Certificate}.quotaKey`,
            `${TableName.Certificate}.hasWildcard`
          ])
        )) as { rootOrgId: string; activeCertificates: string | number; wildcardCertificates: string | number }[];

      const certManagerOrgRows = (await db(TableName.Project)
        .join(TableName.Organization, `${TableName.Project}.orgId`, `${TableName.Organization}.id`)
        .where(`${TableName.Project}.type`, ProjectType.CertificateManager)
        .whereNull(`${TableName.Project}.deleteAfter`)
        .distinct(rootOrgIdSelect)) as { rootOrgId: string }[];

      const usageByRootOrgId = new Map<string, TPkiRootOrgUsageRow>();
      const getRow = (rootOrgId: string) => {
        let row = usageByRootOrgId.get(rootOrgId);
        if (!row) {
          row = { rootOrgId, cas: 0, internalCas: 0, activeCertificates: 0, wildcardCertificates: 0 };
          usageByRootOrgId.set(rootOrgId, row);
        }
        return row;
      };

      certManagerOrgRows.forEach(({ rootOrgId }) => getRow(rootOrgId));
      caRows.forEach(({ rootOrgId, cas, internalCas }) => {
        const row = getRow(rootOrgId);
        row.cas = Number(cas);
        row.internalCas = Number(internalCas);
      });
      activeCertificateRows.forEach(({ rootOrgId, activeCertificates, wildcardCertificates }) => {
        const row = getRow(rootOrgId);
        row.activeCertificates = Number(activeCertificates);
        row.wildcardCertificates = Number(wildcardCertificates);
      });

      return [...usageByRootOrgId.values()];
    } catch (error) {
      throw new DatabaseError({ error, name: "Get PKI usage by root org" });
    }
  }
}
