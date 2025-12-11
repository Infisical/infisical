import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { AccessScope, OrgMembershipStatus, ProjectType, TableName } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { CertStatus } from "@app/services/certificate/certificate-types";

export type TLicenseDALFactory = ReturnType<typeof licenseDALFactory>;

export const licenseDALFactory = (db: TDbClient) => {
  const countOfOrgMembers = async (orgId: string | null, tx?: Knex) => {
    try {
      const doc = await (tx || db.replicaNode())(TableName.Membership)
        .join(TableName.Organization, `${TableName.Organization}.id`, `${TableName.Membership}.scopeOrgId`)
        .where({ status: OrgMembershipStatus.Accepted, scope: AccessScope.Organization })
        .andWhere((bd) => {
          if (orgId) {
            void bd.where(`${TableName.Membership}.scopeOrgId`, orgId);
          }
        })
        .join(TableName.Users, `${TableName.Membership}.actorUserId`, `${TableName.Users}.id`)
        .where(`${TableName.Users}.isGhost`, false)
        .whereNull(`${TableName.Organization}.rootOrgId`)
        .count();
      return Number(doc?.[0]?.count ?? 0);
    } catch (error) {
      throw new DatabaseError({ error, name: "Count of Org Members" });
    }
  };

  const countOfOrgIdentities = async (orgId: string | null, tx?: Knex) => {
    try {
      // count org identities
      const identityDoc = await (tx || db.replicaNode())(TableName.Identity)
        .join(TableName.Organization, `${TableName.Identity}.orgId`, `${TableName.Organization}.id`)
        .where((bd) => {
          if (orgId) {
            void bd.where(`${TableName.Organization}.rootOrgId`, orgId).orWhere(`${TableName.Organization}.id`, orgId);
          }
        })
        .count();

      const identityCount = Number(identityDoc?.[0].count);

      return identityCount;
    } catch (error) {
      throw new DatabaseError({ error, name: "Count of Org Users + Identities" });
    }
  };

  const countOrgUsersAndIdentities = async (orgId: string | null, tx?: Knex) => {
    try {
      // count org users
      const userDoc = await (tx || db.replicaNode())(TableName.Membership)
        .join(TableName.Organization, `${TableName.Organization}.id`, `${TableName.Membership}.scopeOrgId`)
        .where({ status: OrgMembershipStatus.Accepted, scope: AccessScope.Organization })
        .whereNotNull(`${TableName.Membership}.actorUserId`)
        .andWhere((bd) => {
          if (orgId) {
            void bd.where(`${TableName.Membership}.scopeOrgId`, orgId);
          }
        })
        .join(TableName.Users, `${TableName.Membership}.actorUserId`, `${TableName.Users}.id`)
        .where(`${TableName.Users}.isGhost`, false)
        .whereNull(`${TableName.Organization}.rootOrgId`)
        .count();

      const userCount = Number(userDoc?.[0].count);

      // count org identities
      const identityDoc = await (tx || db.replicaNode())(TableName.Identity)
        .join(TableName.Organization, `${TableName.Identity}.orgId`, `${TableName.Organization}.id`)
        .where((bd) => {
          if (orgId) {
            void bd.where(`${TableName.Organization}.rootOrgId`, orgId).orWhere(`${TableName.Organization}.id`, orgId);
          }
        })
        .count();

      const identityCount = Number(identityDoc?.[0].count);

      return userCount + identityCount;
    } catch (error) {
      throw new DatabaseError({ error, name: "Count of Org Users + Identities" });
    }
  };

  const countIdentitiesByProjectType = async (rootOrgId: string) => {
    try {
      const orgs = db(TableName.Organization).where("id", rootOrgId).orWhere("rootOrgId", rootOrgId).select("id");

      const docs = await db
        .replicaNode()(TableName.Membership)
        .join(TableName.Project, `${TableName.Project}.id`, `${TableName.Membership}.scopeProjectId`)
        .leftJoin(TableName.Groups, `${TableName.Groups}.id`, `${TableName.Membership}.actorGroupId`)
        .leftJoin(TableName.UserGroupMembership, (qb) => {
          void qb.on(`${TableName.Groups}.id`, `${TableName.UserGroupMembership}.groupId`);
        })
        .where(`${TableName.Membership}.scope`, AccessScope.Project)
        .where(`${TableName.Membership}.scopeOrgId`, orgs)
        .where((qb) => {
          void qb
            .whereNotNull(`${TableName.Membership}.actorUserId`)
            .orWhereNotNull(`${TableName.Membership}.actorIdentityId`)
            .orWhereNotNull(`${TableName.UserGroupMembership}.userId`);
        })
        .groupBy(`${TableName.Project}.type`)
        .select(db.ref("type").withSchema(TableName.Project))
        .select(
          db.raw(
            `COUNT(DISTINCT COALESCE("${TableName.Membership}"."actorUserId", "${TableName.UserGroupMembership}"."userId")) as "userCount"`
          )
        )
        .select(db.raw(`COUNT(DISTINCT "${TableName.Membership}"."actorIdentityId") as "identityCount"`));

      const result = (docs as unknown as Array<{ type: ProjectType; userCount: string; identityCount: string }>).map(
        (el) => ({ ...el, identityCount: Number(el.identityCount || 0), userCount: Number(el.userCount || 0) })
      );
      return result;
    } catch (error) {
      throw new DatabaseError({ error, name: "CountIdentityByProjectType" });
    }
  };

  const getAllUniqueCertificates = async (rootOrgId: string) => {
    try {
      const orgs = db(TableName.Organization).where("id", rootOrgId).orWhere("rootOrgId", rootOrgId).select("id");
      const result = await db
        .replicaNode()(TableName.Certificate)
        .join(TableName.Project, `${TableName.Project}.id`, `${TableName.Certificate}.projectId`)
        .where(`${TableName.Project}.orgId`, orgs)
        .where(`${TableName.Certificate}.status`, CertStatus.ACTIVE)
        .distinct(
          db.ref("commonName").withSchema(TableName.Certificate),
          db.ref("altNames").withSchema(TableName.Certificate)
        );
      return result as Array<{ commonName: string; altNames: string }>;
    } catch (error) {
      throw new DatabaseError({ error, name: "GetAllUniqueCertificates" });
    }
  };

  const countInternalCas = async (rootOrgId: string) => {
    try {
      const orgs = db(TableName.Organization)
        .join(TableName.Project, `${TableName.Project}.orgId`, `${TableName.Organization}.id`)
        .join(TableName.CertificateAuthority, `${TableName.CertificateAuthority}.projectId`, `${TableName.Project}.id`)
        .where(`${TableName.Organization}.id`, rootOrgId)
        .orWhere("rootOrgId", rootOrgId)
        .select(db.ref("id").withSchema(TableName.CertificateAuthority));

      const result = await db
        .replicaNode()(TableName.InternalCertificateAuthority)
        .where(`${TableName.InternalCertificateAuthority}.caId`, orgs)
        .count();

      return Number(result?.[0]?.count || 0);
    } catch (error) {
      throw new DatabaseError({ error, name: "CountInternalCas" });
    }
  };

  return {
    countOfOrgMembers,
    countOrgUsersAndIdentities,
    countOfOrgIdentities,
    countIdentitiesByProjectType,
    getAllUniqueCertificates,
    countInternalCas
  };
};
