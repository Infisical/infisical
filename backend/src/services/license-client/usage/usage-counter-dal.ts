import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { AccessScope, ProjectType, TableName } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { orgTreeIds } from "@app/lib/knex";
import { CertStatus } from "@app/services/certificate/certificate-types";

export type TUsageCounterDALFactory = ReturnType<typeof usageCounterDALFactory>;

// One metered machine identity resolved to where it was created: the project that owns it, or the org
// itself (projectId null) when it is org-owned.
export type TIdentityOwnershipRow = { orgId: string; projectId: string | null; count: number };

// A metered PKI unit count for one org in the tree. Certificates carry no per-project attribution here
// because the meter dedupes by quotaKey across the whole tree (see getActiveCertificateOrgBreakdown).
export type TOrgUnitCountRow = { orgId: string; count: number };

// Active certificates for one org, with the wildcard subset that active_certs and wildcard_certs both
// read, so the two meters can never disagree about which certificates are live.
export type TCertificateOrgUnitRow = TOrgUnitCountRow & { wildcard: number };

const toCount = (row: unknown): number => Number((row as { count?: string | number } | undefined)?.count ?? 0);

// Live counts for the project-scoped metered features, summed across the whole org tree and excluding
// soft-deleted projects so they don't inflate a quota.
export const usageCounterDALFactory = (db: TDbClient) => {
  // orgId omitted means instance-wide: self-hosted is one licence over the whole database and reports
  // under an identity that is not an org id, so the org filter has to come off rather than be handed a
  // non-uuid.
  const countInternalCas = async (orgId?: string): Promise<number> => {
    try {
      const qb = db
        .replicaNode()(TableName.CertificateAuthority)
        .join(
          TableName.InternalCertificateAuthority,
          `${TableName.CertificateAuthority}.id`,
          `${TableName.InternalCertificateAuthority}.caId`
        )
        .join(TableName.Project, `${TableName.CertificateAuthority}.projectId`, `${TableName.Project}.id`)
        .whereNull(`${TableName.Project}.deleteAfter`);

      if (orgId) void qb.whereIn(`${TableName.Project}.orgId`, orgTreeIds(db.replicaNode(), orgId));

      const row = await qb.count(`${TableName.CertificateAuthority}.id as count`).first();
      return toCount(row);
    } catch (error) {
      throw new DatabaseError({ error, name: "Count internal CAs for usage" });
    }
  };

  // Code signing is licensed separately, so signer certificates are excluded. Anchored on the signer
  // rather than on the code_signing EKU: that usage is caller-supplied, so a tenant could append it to
  // every request and escape the quota entirely.
  //
  // Matched on quotaKey rather than on pki_signers.certificateId, which points only at a signer's
  // current certificate. Every certificate a signer issues carries the signer's commonName, so the
  // whole renewal chain shares one quotaKey and this covers it without a schema change.
  const $excludeSignerCertificates = (qb: Knex.QueryBuilder) =>
    qb.whereNotExists((sub) => {
      void sub
        .select(db.raw("1"))
        .from(`${TableName.PkiSigners} as s`)
        .join(`${TableName.Certificate} as sc`, "sc.id", "s.certificateId")
        .whereRaw(`sc."quotaKey" = ??`, [`${TableName.Certificate}.quotaKey`])
        // Same project, so one tenant cannot exempt a certificate by matching another's signer names.
        .whereRaw(`s."projectId" = ??`, [`${TableName.Certificate}.projectId`]);
    });

  // No `status = 'active'` filter: nothing writes EXPIRED or RENEWED, both are derived at read time.
  // orgId omitted means instance-wide; see countInternalCas.
  const $activeQuotaCertificates = (orgId?: string) => {
    const qb = db
      .replicaNode()(TableName.Certificate)
      .join(TableName.Project, `${TableName.Certificate}.projectId`, `${TableName.Project}.id`)
      .whereNull(`${TableName.Project}.deleteAfter`)
      .where(`${TableName.Certificate}.notAfter`, ">", new Date())
      .whereNot(`${TableName.Certificate}.status`, CertStatus.REVOKED);

    if (orgId) void qb.whereIn(`${TableName.Project}.orgId`, orgTreeIds(db.replicaNode(), orgId));

    return $excludeSignerCertificates(qb);
  };

  // The count spans the org tree, so its cache must be keyed on the root: per-org keys would give each
  // sub-org its own copy that only its own writes increment.
  const resolveRootOrgId = async (orgId: string): Promise<string> => {
    try {
      const row = (await db
        .replicaNode()(TableName.Organization)
        .where("id", orgId)
        .select(db.raw(`COALESCE("rootOrgId", "id") as "rootOrgId"`))
        .first()) as { rootOrgId?: string } | undefined;
      return row?.rootOrgId ?? orgId;
    } catch (error) {
      throw new DatabaseError({ error, name: "Resolve root org id" });
    }
  };

  // Joins on projectId rather than caId, which is nullable and would drop imported and discovered
  // certificates. Both counts read hasWildcard from the covering index; filtering with LIKE over
  // commonName/altNames instead forces a sequential scan (measured: ~2x at 600k rows).
  const countActiveCertificateQuotaKeysByOrg = async (orgId?: string): Promise<{ total: number; wildcard: number }> => {
    try {
      const row = (await $activeQuotaCertificates(orgId)
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
  };

  // Lets an org at its cap keep renewing: reissuing names it already holds cannot raise the count.
  const isCertificateQuotaKeyActiveInOrg = async (orgId: string, quotaKey: string): Promise<boolean> => {
    try {
      const row = (await $activeQuotaCertificates(orgId)
        .where(`${TableName.Certificate}.quotaKey`, quotaKey)
        .select(`${TableName.Certificate}.id`)
        .first()) as { id?: string } | undefined;
      return Boolean(row);
    } catch (error) {
      throw new DatabaseError({ error, name: "Check certificate quota key active for org" });
    }
  };

  const countPamResources = async (orgId: string): Promise<number> => {
    try {
      const row = await db
        .replicaNode()(TableName.PamResource)
        .join(TableName.Project, `${TableName.PamResource}.projectId`, `${TableName.Project}.id`)
        .where(`${TableName.Project}.orgId`, orgId)
        .whereNull(`${TableName.Project}.deleteAfter`)
        .count(`${TableName.PamResource}.id as count`)
        .first();
      return toCount(row);
    } catch (error) {
      throw new DatabaseError({ error, name: "Count PAM resources for usage" });
    }
  };

  // The distinct actor set behind the project-scoped identity meters, as ('u' | 'i', entityId) rows.
  // Shared by the meter and the usage breakdown so a breakdown can never disagree with the number the
  // customer is billed on.
  const $projectIdentityEntities = (projectType: ProjectType, orgId?: string) => {
    const scopedOrgIds = () => {
      const qb = db.replicaNode()(TableName.Organization).select(`${TableName.Organization}.id`);
      if (orgId) {
        void qb.where((bd) => {
          void bd.where(`${TableName.Organization}.id`, orgId).orWhere(`${TableName.Organization}.rootOrgId`, orgId);
        });
      }
      return qb;
    };

    const typedProjectIds = () => {
      const qb = db
        .replicaNode()(TableName.Project)
        .where(`${TableName.Project}.type`, projectType)
        .whereNull(`${TableName.Project}.deleteAfter`)
        .select(`${TableName.Project}.id`);
      if (orgId) void qb.whereIn(`${TableName.Project}.orgId`, scopedOrgIds());
      return qb;
    };

    const orgMemberUserIds = () => {
      const qb = db
        .replicaNode()(TableName.Membership)
        .join(TableName.Users, `${TableName.Membership}.actorUserId`, `${TableName.Users}.id`)
        .where(`${TableName.Membership}.scope`, AccessScope.Organization)
        .whereNotNull(`${TableName.Membership}.actorUserId`)
        .where(`${TableName.Users}.isGhost`, false)
        .where(`${TableName.Users}.isAccepted`, true)
        .select(`${TableName.Membership}.actorUserId`);
      if (orgId) void qb.whereIn(`${TableName.Membership}.scopeOrgId`, scopedOrgIds());
      return qb;
    };

    // Identities that actually belong to the org / child orgs (licenseDAL identity scope).
    const orgIdentityIds = () => {
      const qb = db.replicaNode()(TableName.Identity).select(`${TableName.Identity}.id`);
      if (orgId) void qb.whereIn(`${TableName.Identity}.orgId`, scopedOrgIds());
      return qb;
    };

    // scope = project + a non-null actor column + whereIn against the typed project ids matches the
    // partial unique indexes exactly; each project-scope row carries exactly one actor column.
    const directUsers = db
      .replicaNode()(TableName.Membership)
      .where(`${TableName.Membership}.scope`, AccessScope.Project)
      .whereNotNull(`${TableName.Membership}.actorUserId`)
      .whereIn(`${TableName.Membership}.scopeProjectId`, typedProjectIds())
      .whereIn(`${TableName.Membership}.actorUserId`, orgMemberUserIds())
      .select(db.raw("'u' as kind"))
      .select(`${TableName.Membership}.actorUserId as entityId`);

    const distinctEntities = directUsers.union(
      [
        (qb) =>
          void qb
            .from(TableName.Membership)
            .where(`${TableName.Membership}.scope`, AccessScope.Project)
            .whereNotNull(`${TableName.Membership}.actorIdentityId`)
            .whereIn(`${TableName.Membership}.scopeProjectId`, typedProjectIds())
            .whereIn(`${TableName.Membership}.actorIdentityId`, orgIdentityIds())
            .select(db.raw("'i' as kind"))
            .select(`${TableName.Membership}.actorIdentityId as entityId`),
        // A group assigned to a project (membership with actorGroupId) brings its members into it. A
        // pending group membership (invited, not yet joined) does not occupy a seat.
        (qb) =>
          void qb
            .from(TableName.UserGroupMembership)
            .join(
              TableName.Membership,
              `${TableName.UserGroupMembership}.groupId`,
              `${TableName.Membership}.actorGroupId`
            )
            .where(`${TableName.Membership}.scope`, AccessScope.Project)
            .where(`${TableName.UserGroupMembership}.isPending`, false)
            .whereIn(`${TableName.Membership}.scopeProjectId`, typedProjectIds())
            .whereIn(`${TableName.UserGroupMembership}.userId`, orgMemberUserIds())
            .select(db.raw("'u' as kind"))
            .select(`${TableName.UserGroupMembership}.userId as entityId`),
        (qb) =>
          void qb
            .from(TableName.IdentityGroupMembership)
            .join(
              TableName.Membership,
              `${TableName.IdentityGroupMembership}.groupId`,
              `${TableName.Membership}.actorGroupId`
            )
            .where(`${TableName.Membership}.scope`, AccessScope.Project)
            .whereIn(`${TableName.Membership}.scopeProjectId`, typedProjectIds())
            .whereIn(`${TableName.IdentityGroupMembership}.identityId`, orgIdentityIds())
            .select(db.raw("'i' as kind"))
            .select(`${TableName.IdentityGroupMembership}.identityId as entityId`)
      ],
      true
    );
    return distinctEntities;
  };

  const countProjectIdentities = async (projectType: ProjectType, orgId?: string): Promise<number> => {
    // .as() on a union builder is typed as any, so cast the awaited row before counting.
    const row = (await db
      .replicaNode()
      .count("* as count")
      .from($projectIdentityEntities(projectType, orgId).as("project_identities"))
      .first()) as { count?: string | number } | undefined;
    return toCount(row);
  };

  // The same actors countProjectIdentities meters, split by actor type. The meter bills one number for
  // both; the breakdown sheet shows the human/machine split behind it.
  const countProjectIdentitiesByKind = async (
    projectType: ProjectType,
    orgId?: string
  ): Promise<{ users: number; identities: number }> => {
    const rows = (await db
      .replicaNode()
      .select("kind")
      .count("* as count")
      .from($projectIdentityEntities(projectType, orgId).as("project_identities"))
      .groupBy("kind")) as { kind: string; count: string | number }[];

    const byKind = (kind: string) => Number(rows.find((row) => row.kind === kind)?.count ?? 0);
    return { users: byKind("u"), identities: byKind("i") };
  };

  // Machine identities from the same metered set, attributed to where each was created: the project
  // that owns it, or the org itself when org-owned. Seats are held by membership, which is
  // many-to-many, so grouping on membership would count one identity once per project it sits in;
  // identities.projectId is a single column and partitions the metered total exactly once.
  const getProjectIdentityOwnershipBreakdown = async (
    projectType: ProjectType,
    orgId: string
  ): Promise<TIdentityOwnershipRow[]> => {
    const rows = (await db
      .replicaNode()({ i: TableName.Identity })
      .whereIn(
        "i.id",
        db
          .replicaNode()
          .select("entityId")
          .from($projectIdentityEntities(projectType, orgId).as("project_identities"))
          .where("kind", "i")
      )
      .groupBy("i.orgId", "i.projectId")
      .select({ orgId: "i.orgId", projectId: "i.projectId" })
      .count("i.id as count")) as { orgId: string; projectId: string | null; count: string | number }[];

    return rows.map((row) => ({ orgId: row.orgId, projectId: row.projectId, count: Number(row.count) }));
  };

  const countSecretManagementIdentities = async (orgId?: string): Promise<number> => {
    try {
      return await countProjectIdentities(ProjectType.SecretManager, orgId);
    } catch (error) {
      throw new DatabaseError({ error, name: "Count secret management identities for usage" });
    }
  };

  const countPamIdentities = async (orgId?: string): Promise<number> => {
    try {
      return await countProjectIdentities(ProjectType.PAM, orgId);
    } catch (error) {
      throw new DatabaseError({ error, name: "Count PAM identities for usage" });
    }
  };

  const countProjectIdentitiesByKindFor = async (projectType: ProjectType, orgId: string) => {
    try {
      return await countProjectIdentitiesByKind(projectType, orgId);
    } catch (error) {
      throw new DatabaseError({ error, name: "Count project identities by kind for usage breakdown" });
    }
  };

  const getProjectIdentityBreakdown = async (projectType: ProjectType, orgId: string) => {
    try {
      return await getProjectIdentityOwnershipBreakdown(projectType, orgId);
    } catch (error) {
      throw new DatabaseError({ error, name: "Get project identity breakdown for usage" });
    }
  };

  // Mirrors countInternalCas exactly, including its lack of a status filter: a disabled or
  // pending-certificate CA is metered, so the breakdown counts it too or it would not add up to the
  // number the customer is billed on.
  const getInternalCaOrgBreakdown = async (orgId: string): Promise<TOrgUnitCountRow[]> => {
    try {
      const rows = (await db
        .replicaNode()(TableName.CertificateAuthority)
        .join(
          TableName.InternalCertificateAuthority,
          `${TableName.CertificateAuthority}.id`,
          `${TableName.InternalCertificateAuthority}.caId`
        )
        .join(TableName.Project, `${TableName.CertificateAuthority}.projectId`, `${TableName.Project}.id`)
        .whereNull(`${TableName.Project}.deleteAfter`)
        .whereIn(`${TableName.Project}.orgId`, orgTreeIds(db.replicaNode(), orgId))
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
  };

  // The meter counts DISTINCT quotaKey across the whole org tree, so one certificate name issued in two
  // orgs is a single billable unit. Splitting that by org therefore needs each quotaKey attributed to
  // exactly one of them, else the parts sum past the billed total. The earliest issuance wins (org id
  // breaks a tie) so the attribution is stable between reads rather than shifting with row order.
  const getActiveCertificateOrgBreakdown = async (orgId: string): Promise<TCertificateOrgUnitRow[]> => {
    try {
      const attributed = $activeQuotaCertificates(orgId)
        .whereNotNull(`${TableName.Certificate}.quotaKey`)
        .distinctOn(`${TableName.Certificate}.quotaKey`)
        .orderBy([
          { column: `${TableName.Certificate}.quotaKey` },
          { column: `${TableName.Certificate}.notBefore`, order: "asc" },
          { column: `${TableName.Project}.orgId`, order: "asc" }
        ])
        .select({
          quotaKey: `${TableName.Certificate}.quotaKey`,
          orgId: `${TableName.Project}.orgId`,
          hasWildcard: `${TableName.Certificate}.hasWildcard`
        });

      const rows = (await db
        .replicaNode()
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
  };

  return {
    countInternalCas,
    resolveRootOrgId,
    countActiveCertificateQuotaKeysByOrg,
    isCertificateQuotaKeyActiveInOrg,
    countPamResources,
    countSecretManagementIdentities,
    countPamIdentities,
    countProjectIdentitiesByKindFor,
    getProjectIdentityBreakdown,
    getInternalCaOrgBreakdown,
    getActiveCertificateOrgBreakdown
  };
};
