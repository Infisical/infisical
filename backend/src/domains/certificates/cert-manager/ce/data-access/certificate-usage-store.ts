import { Knex } from "knex";

import { ProjectType, TableName } from "@app/db/schemas";
import { toCount, TReadOptions, TStoreConnection } from "@app/domains/lib/data-access";
import { CertificateSource } from "@app/ee/services/pki-discovery/pki-discovery-types";
import { DatabaseError } from "@app/lib/errors";
import { orgTreeIds } from "@app/lib/knex";
import { CertStatus } from "@app/services/certificate/certificate-types";

import {
  TCertificateOrgUnitCount,
  TCertificateUsageStore,
  TOrgUnitCount,
  TPkiRootOrgUsage
} from "../services/dependencies";

// Reads tables we'll own once cert issuance moves in (see ../../AGENTS.md).
export class CertificateUsageStore implements TCertificateUsageStore {
  constructor(private readonly connection: TStoreConnection) {}

  // No orgId = whole instance. Self-hosted reports under a non-uuid identity, so drop the org filter
  // instead of passing it.
  private static internalCas(knex: Knex, orgId?: string) {
    const qb = knex(TableName.CertificateAuthority)
      .join(
        TableName.InternalCertificateAuthority,
        `${TableName.CertificateAuthority}.id`,
        `${TableName.InternalCertificateAuthority}.caId`
      )
      .join(TableName.Project, `${TableName.CertificateAuthority}.projectId`, `${TableName.Project}.id`)
      .whereNull(`${TableName.Project}.deleteAfter`);

    if (orgId) void qb.whereIn(`${TableName.Project}.orgId`, orgTreeIds(knex, orgId));

    return qb;
  }

  async countInternalCas(orgId?: string, options?: TReadOptions): Promise<number> {
    try {
      const knex = this.connection.reader(options);
      const row = (await CertificateUsageStore.internalCas(knex, orgId)
        .count(`${TableName.CertificateAuthority}.id as count`)
        .first()) as { count?: string | number } | undefined;
      return toCount(row?.count);
    } catch (error) {
      throw new DatabaseError({ error, name: "Count internal CAs for usage" });
    }
  }

  // Code signing is licensed separately, so skip signer certs. Keyed on the signer, not the EKU (callers set
  // the EKU and could dodge the quota), and on quotaKey so the whole renewal chain is covered. The signer must
  // be in the same project, so a tenant can't exempt certs by matching someone else's signer names.
  private static excludeSignerCertificates(knex: Knex, qb: Knex.QueryBuilder) {
    return qb.whereNotExists((sub) => {
      void sub
        .select(knex.raw("1"))
        .from(`${TableName.PkiSigners} as s`)
        .join(`${TableName.Certificate} as sc`, "sc.id", "s.certificateId")
        .whereRaw(`sc."quotaKey" = ??`, [`${TableName.Certificate}.quotaKey`])
        .whereRaw(`s."projectId" = ??`, [`${TableName.Certificate}.projectId`]);
    });
  }

  // No status = 'active' filter: EXPIRED and RENEWED are derived at read time, never written.
  private static activeQuotaCertificates(knex: Knex, orgId?: string) {
    const qb = knex(TableName.Certificate)
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

    if (orgId) void qb.whereIn(`${TableName.Project}.orgId`, orgTreeIds(knex, orgId));

    return CertificateUsageStore.excludeSignerCertificates(knex, qb);
  }

  // Join on projectId, not caId: caId is nullable and would drop imported/discovered certs. hasWildcard
  // comes from the covering index; LIKE over commonName/altNames forces a seq scan (~2x slower at 600k rows).
  async countActiveCertificateQuotaKeys(
    orgId?: string,
    options?: TReadOptions
  ): Promise<{ total: number; wildcard: number }> {
    try {
      const knex = this.connection.reader(options);
      const row = (await CertificateUsageStore.activeQuotaCertificates(knex, orgId)
        .countDistinct(`${TableName.Certificate}.quotaKey as total`)
        .select(
          knex.raw(`COUNT(DISTINCT ??) FILTER (WHERE ??) as "wildcard"`, [
            `${TableName.Certificate}.quotaKey`,
            `${TableName.Certificate}.hasWildcard`
          ])
        )
        .first()) as { total?: string | number; wildcard?: string | number } | undefined;

      return { total: toCount(row?.total), wildcard: toCount(row?.wildcard) };
    } catch (error) {
      throw new DatabaseError({ error, name: "Count active certificate quota keys for org" });
    }
  }

  // Lets an org at its cap keep renewing, since reissuing names it already has can't raise the count.
  async isCertificateQuotaKeyActive(
    orgId: string | undefined,
    quotaKey: string,
    options?: TReadOptions
  ): Promise<boolean> {
    try {
      const knex = this.connection.reader(options);
      const row = (await CertificateUsageStore.activeQuotaCertificates(knex, orgId)
        .where(`${TableName.Certificate}.quotaKey`, quotaKey)
        .select(`${TableName.Certificate}.id`)
        .first()) as { id?: string } | undefined;
      return Boolean(row);
    } catch (error) {
      throw new DatabaseError({ error, name: "Check certificate quota key active for org" });
    }
  }

  async getInternalCaOrgBreakdown(orgId?: string, options?: TReadOptions): Promise<TOrgUnitCount[]> {
    try {
      const knex = this.connection.reader(options);
      const rows = (await CertificateUsageStore.internalCas(knex, orgId)
        .groupBy(`${TableName.Project}.orgId`)
        .select({ orgId: `${TableName.Project}.orgId` })
        .count(`${TableName.CertificateAuthority}.id as count`)) as {
        orgId: string;
        count: string | number;
      }[];

      return rows.map((row) => ({ orgId: row.orgId, count: toCount(row.count) }));
    } catch (error) {
      throw new DatabaseError({ error, name: "Get internal CA breakdown for usage" });
    }
  }

  // Each quotaKey lands in exactly one org so the split adds up to the billed total. Earliest issuance
  // wins (org id breaks ties) so it's stable between reads. A quotaKey is wildcard if any of its rows is.
  async getActiveCertificateOrgBreakdown(orgId?: string, options?: TReadOptions): Promise<TCertificateOrgUnitCount[]> {
    try {
      const knex = this.connection.reader(options);
      const attributed = CertificateUsageStore.activeQuotaCertificates(knex, orgId)
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
        .select(
          knex.raw(`bool_or(??) OVER (PARTITION BY ??) as "hasWildcard"`, [
            `${TableName.Certificate}.hasWildcard`,
            `${TableName.Certificate}.quotaKey`
          ])
        );

      const rows = (await knex
        .from(attributed.as("attributed"))
        .groupBy("attributed.orgId")
        .select({ orgId: "attributed.orgId" })
        .count("* as total")
        .select(knex.raw(`COUNT(*) FILTER (WHERE attributed."hasWildcard") as "wildcard"`))) as {
        orgId: string;
        total: string | number;
        wildcard: string | number;
      }[];

      return rows.map((row) => ({
        orgId: row.orgId,
        count: toCount(row.total),
        wildcard: toCount(row.wildcard)
      }));
    } catch (error) {
      throw new DatabaseError({ error, name: "Get active certificate breakdown for usage" });
    }
  }

  // Orgs with a Certificate Manager project show up even at zero, so one that stops using PKI gets zeros
  // instead of stale counts. The last such project can't be deleted.
  async getPkiUsageByRootOrg(options?: TReadOptions): Promise<TPkiRootOrgUsage[]> {
    const knex = this.connection.reader(options);
    const orgColumns = [`${TableName.Organization}.rootOrgId`, `${TableName.Organization}.id`];
    const rootOrgIdSql = knex.raw(`COALESCE(??, ??)`, orgColumns);
    const rootOrgIdSelect = knex.raw(`COALESCE(??, ??) as "rootOrgId"`, orgColumns);

    try {
      const caRows = (await knex(TableName.CertificateAuthority)
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

      const activeCertificateRows = (await CertificateUsageStore.activeQuotaCertificates(knex)
        .join(TableName.Organization, `${TableName.Project}.orgId`, `${TableName.Organization}.id`)
        .groupBy(rootOrgIdSql)
        .select(rootOrgIdSelect)
        .countDistinct(`${TableName.Certificate}.quotaKey as activeCertificates`)
        .select(
          knex.raw(`COUNT(DISTINCT ??) FILTER (WHERE ??) as "wildcardCertificates"`, [
            `${TableName.Certificate}.quotaKey`,
            `${TableName.Certificate}.hasWildcard`
          ])
        )) as { rootOrgId: string; activeCertificates: string | number; wildcardCertificates: string | number }[];

      const certManagerOrgRows = (await knex(TableName.Project)
        .join(TableName.Organization, `${TableName.Project}.orgId`, `${TableName.Organization}.id`)
        .where(`${TableName.Project}.type`, ProjectType.CertificateManager)
        .whereNull(`${TableName.Project}.deleteAfter`)
        .distinct(rootOrgIdSelect)) as { rootOrgId: string }[];

      const usageByRootOrgId = new Map<string, TPkiRootOrgUsage>();
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
        row.cas = toCount(cas);
        row.internalCas = toCount(internalCas);
      });
      activeCertificateRows.forEach(({ rootOrgId, activeCertificates, wildcardCertificates }) => {
        const row = getRow(rootOrgId);
        row.activeCertificates = toCount(activeCertificates);
        row.wildcardCertificates = toCount(wildcardCertificates);
      });

      return [...usageByRootOrgId.values()];
    } catch (error) {
      throw new DatabaseError({ error, name: "Get PKI usage by root org" });
    }
  }
}
