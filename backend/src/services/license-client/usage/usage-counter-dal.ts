import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { AccessScope, ProjectType, TableName } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { orgTreeIds } from "@app/lib/knex";
import { CertStatus } from "@app/services/certificate/certificate-types";
import { CertExtendedKeyUsage, CertExtendedKeyUsageType } from "@app/services/certificate-common/certificate-constants";

export type TUsageCounterDALFactory = ReturnType<typeof usageCounterDALFactory>;

const toCount = (row: unknown): number => Number((row as { count?: string | number } | undefined)?.count ?? 0);

// Live counts for the project-scoped metered features, summed across the whole org tree and excluding
// soft-deleted projects so they don't inflate a quota.
export const usageCounterDALFactory = (db: TDbClient) => {
  const countInternalCas = async (orgId: string): Promise<number> => {
    try {
      const row = await db
        .replicaNode()(TableName.CertificateAuthority)
        .join(
          TableName.InternalCertificateAuthority,
          `${TableName.CertificateAuthority}.id`,
          `${TableName.InternalCertificateAuthority}.caId`
        )
        .join(TableName.Project, `${TableName.CertificateAuthority}.projectId`, `${TableName.Project}.id`)
        .whereIn(`${TableName.Project}.orgId`, orgTreeIds(db.replicaNode(), orgId))
        .whereNull(`${TableName.Project}.deleteAfter`)
        .count(`${TableName.CertificateAuthority}.id as count`)
        .first();
      return toCount(row);
    } catch (error) {
      throw new DatabaseError({ error, name: "Count internal CAs for usage" });
    }
  };

  const countActiveCerts = async (orgId: string): Promise<number> => {
    try {
      const row = await db
        .replicaNode()(TableName.Certificate)
        .join(TableName.Project, `${TableName.Certificate}.projectId`, `${TableName.Project}.id`)
        .whereIn(`${TableName.Project}.orgId`, orgTreeIds(db.replicaNode(), orgId))
        .whereNull(`${TableName.Project}.deleteAfter`)
        .where(`${TableName.Certificate}.status`, CertStatus.ACTIVE)
        .where(`${TableName.Certificate}.notAfter`, ">", new Date())
        .whereNull(`${TableName.Certificate}.revokedAt`)
        .whereNull(`${TableName.Certificate}.renewedByCertificateId`)
        .count(`${TableName.Certificate}.id as count`)
        .first();
      return toCount(row);
    } catch (error) {
      throw new DatabaseError({ error, name: "Count active certificates for usage" });
    }
  };

  // Matched on EKU rather than a pki_signers join, which tracks only a signer's current certificate
  // and would recount it on renewal. The COALESCE is required: extendedKeyUsages is nullable and
  // `NULL && ARRAY[...]` is NULL, which fails the WHERE and drops every EKU-less certificate.
  const $excludeCodeSigningCertificates = (qb: Knex.QueryBuilder) =>
    qb.whereRaw(`NOT (COALESCE(??, '{}') && ?::text[])`, [
      `${TableName.Certificate}.extendedKeyUsages`,
      [CertExtendedKeyUsageType.CODE_SIGNING, CertExtendedKeyUsage.CODE_SIGNING]
    ]);

  // No `status = 'active'` filter: nothing writes EXPIRED or RENEWED, both are derived at read time.
  const $activeQuotaCertificates = (orgId: string) => {
    const qb = db
      .replicaNode()(TableName.Certificate)
      .join(TableName.Project, `${TableName.Certificate}.projectId`, `${TableName.Project}.id`)
      .whereIn(`${TableName.Project}.orgId`, orgTreeIds(db.replicaNode(), orgId))
      .whereNull(`${TableName.Project}.deleteAfter`)
      .where(`${TableName.Certificate}.notAfter`, ">", new Date())
      .whereNot(`${TableName.Certificate}.status`, CertStatus.REVOKED);

    return $excludeCodeSigningCertificates(qb);
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
  // certificates. Wildcards need no stored column because isWildcardPattern is just includes("*"), so
  // this LIKE cannot drift from it.
  const countActiveCertificateQuotaKeysByOrg = async (orgId: string): Promise<{ total: number; wildcard: number }> => {
    try {
      const row = (await $activeQuotaCertificates(orgId)
        .countDistinct(`${TableName.Certificate}.quotaKey as total`)
        .select(
          db.raw(`COUNT(DISTINCT ??) FILTER (WHERE ?? LIKE '%*%' OR ?? LIKE '%*%') as "wildcard"`, [
            `${TableName.Certificate}.quotaKey`,
            `${TableName.Certificate}.commonName`,
            `${TableName.Certificate}.altNames`
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

  const countProjectIdentities = async (projectType: ProjectType, orgId?: string): Promise<number> => {
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
    // .as() on a union builder is typed as any, so cast the awaited row before counting.
    const row = (await db.replicaNode().count("* as count").from(distinctEntities.as("project_identities")).first()) as
      | { count?: string | number }
      | undefined;
    return toCount(row);
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

  return {
    countInternalCas,
    countActiveCerts,
    resolveRootOrgId,
    countActiveCertificateQuotaKeysByOrg,
    isCertificateQuotaKeyActiveInOrg,
    countPamResources,
    countSecretManagementIdentities,
    countPamIdentities
  };
};
