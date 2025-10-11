import { TDbClient } from "@app/db";
import { AccessScope, SortDirection, TableName, TNamespaces } from "@app/db/schemas";
import { ormify, selectAllTableCols, TOrmify } from "@app/lib/knex";
import { ActorType } from "@app/services/auth/auth-type";

import { SearchNamespaceSortBy } from "./namespace-types";

export interface TNamespaceDALFactory extends TOrmify<TableName.Namespace> {
  searchNamespaces: (dto: {
    orgId: string;
    actor: ActorType;
    actorId: string;
    limit?: number;
    offset?: number;
    name?: string;
    sortBy?: SearchNamespaceSortBy;
    sortDir?: SortDirection;
    namespaceIds?: string[];
  }) => Promise<{ docs: Array<TNamespaces & { isMember: boolean }>; totalCount: number }>;

  listActorNamespaces: (dto: {
    orgId: string;
    actor: ActorType;
    actorId: string;
    limit?: number;
    offset?: number;
    name?: string;
    sortBy?: SearchNamespaceSortBy;
    sortDir?: SortDirection;
  }) => Promise<{ docs: TNamespaces[]; totalCount: number }>;
}

export const namespaceDALFactory = (db: TDbClient): TNamespaceDALFactory => {
  const orm = ormify(db, TableName.Namespace);

  const listActorNamespaces: TNamespaceDALFactory["listActorNamespaces"] = async (dto) => {
    const { limit = 20, offset = 0, sortBy = SearchNamespaceSortBy.NAME, sortDir = SortDirection.ASC } = dto;

    const docs = await db(TableName.Namespace)
      .join(TableName.Membership, (qb) => {
        qb.on(`${TableName.Membership}.scopeNamespaceId`, `${TableName.Namespace}.id`).andOn(
          `${TableName.Membership}.scopeOrgId`,
          `${TableName.Namespace}.orgId`
        );
      })
      .where((qb) => {
        if (dto.actor === ActorType.USER) {
          void qb.where(`${TableName.Membership}.actorUserId`, dto.actorId);
        } else {
          void qb.where(`${TableName.Membership}.actorIdentityId`, dto.actorId);
        }
      })
      .where(`${TableName.Membership}.scopeOrgId`, dto.orgId)
      .where(`${TableName.Membership}.scope`, AccessScope.Namespace)
      .select(selectAllTableCols(TableName.Namespace))
      .select<(TNamespaces & { count: number })[]>(
        db.raw(
          `count(DISTINCT ${TableName.Namespace}."id") OVER(PARTITION BY ${TableName.Membership}."scopeOrgId") as total`
        )
      )
      .limit(limit)
      .offset(offset)
      .where((qb) => {
        if (dto.name) {
          void qb.whereILike(`${TableName.Namespace}.name`, `%${dto.name}%`);
        }

        if (sortBy === SearchNamespaceSortBy.NAME) {
          void qb.orderBy([{ column: `${TableName.Namespace}.name`, order: sortDir }]);
        }
      });

    return { docs, totalCount: Number(docs?.[0]?.count ?? 0) };
  };

  const searchNamespaces: TNamespaceDALFactory["searchNamespaces"] = async (dto) => {
    const { limit = 20, offset = 0, sortBy = SearchNamespaceSortBy.NAME, sortDir = SortDirection.ASC } = dto;

    const groupMembershipSubquery = db(TableName.Groups)
      .leftJoin(TableName.UserGroupMembership, `${TableName.UserGroupMembership}.groupId`, `${TableName.Groups}.id`)
      .where(`${TableName.Groups}.orgId`, dto.orgId)
      .where(`${TableName.UserGroupMembership}.userId`, dto.actorId)
      .select(db.ref("id").withSchema(TableName.Groups));

    const membershipSubQuery = db(TableName.Membership)
      .where(`${TableName.Membership}.scope`, AccessScope.Namespace)
      .where((qb) => {
        if (dto.actor === ActorType.IDENTITY) {
          void qb.where(`${TableName.Membership}.actorIdentityId`, dto.actorId);
        } else {
          void qb
            .where(`${TableName.Membership}.actorUserId`, dto.actorId)
            .orWhereIn(`${TableName.Membership}.actorGroupId`, groupMembershipSubquery);
        }
      })
      .where(`${TableName.Membership}.scopeOrgId`, dto.orgId)
      .select("scopeProjectId");

    // Get the SQL strings for the subqueries
    const membershipSQL = membershipSubQuery.toQuery();

    const query = db
      .replicaNode()(TableName.Namespace)
      .where(`${TableName.Namespace}.orgId`, dto.orgId)
      .select(selectAllTableCols(TableName.Namespace))
      .select(db.raw("COUNT(*) OVER() AS count"))
      .select<(TNamespaces & { isMember: boolean; count: number })[]>(
        db.raw(
          `
                  CASE
                    WHEN ${TableName.Namespace}.id IN (?) THEN TRUE
                    ELSE FALSE
                  END as "isMember"
                `,
          [db.raw(membershipSQL)]
        )
      )
      .limit(limit)
      .offset(offset);

    if (sortBy === SearchNamespaceSortBy.NAME) {
      void query.orderBy([{ column: `${TableName.Namespace}.name`, order: sortDir }]);
    }

    if (dto.name) {
      void query.whereILike(`${TableName.Namespace}.name`, `%${dto.name}%`);
    }

    if (dto.namespaceIds?.length) {
      void query.whereIn(`${TableName.Namespace}.id`, dto.namespaceIds);
    }

    const docs = await query;

    return { docs, totalCount: Number(docs?.[0]?.count ?? 0) };
  };

  return { ...orm, searchNamespaces, listActorNamespaces };
};
