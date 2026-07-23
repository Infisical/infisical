import { TDbClient } from "@app/db";
import { AccessScope, ProjectType, TableName } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { CertStatus } from "@app/services/certificate/certificate-types";

export type TUsageCounterDALFactory = ReturnType<typeof usageCounterDALFactory>;

const toCount = (row: unknown): number => Number((row as { count?: string | number } | undefined)?.count ?? 0);

// Live counts for the project-scoped metered features. Each sums across the org's projects,
// excluding soft-deleted projects so they don't inflate a quota. Org-scoped identities are
// counted via licenseDAL.countOrgUsersAndIdentities and wired in usage-counters.ts.
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
        .where(`${TableName.Project}.orgId`, orgId)
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
        .where(`${TableName.Project}.orgId`, orgId)
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

  return { countInternalCas, countActiveCerts, countPamResources, countSecretManagementIdentities, countPamIdentities };
};
