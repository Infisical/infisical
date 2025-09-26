import { TDbClient } from "@app/db";
import { SortDirection, TableName, TNamespaces } from "@app/db/schemas";
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

    const query =
      dto.actor === ActorType.USER
        ? db(TableName.Namespace)
            .join(
              TableName.NamespaceMembership,
              `${TableName.NamespaceMembership}.namespaceId`,
              `${TableName.Namespace}.id`
            )
            .join(
              TableName.OrgMembership,
              `${TableName.OrgMembership}.id`,
              `${TableName.NamespaceMembership}.orgUserMembershipId`
            )
            .where(`${TableName.OrgMembership}.userId`, dto.actorId)
            .where(`${TableName.OrgMembership}.orgId`, dto.orgId)
            .select(selectAllTableCols(TableName.Namespace))
            .select<(TNamespaces & { count: number })[]>(db.raw("COUNT(*) OVER() AS count"))
        : db(TableName.Namespace)
            .join(
              TableName.NamespaceMembership,
              `${TableName.NamespaceMembership}.namespaceId`,
              `${TableName.Namespace}.id`
            )
            .join(
              TableName.IdentityOrgMembership,
              `${TableName.IdentityOrgMembership}.id`,
              `${TableName.NamespaceMembership}.orgIdentityMembershipId`
            )
            .where(`${TableName.IdentityOrgMembership}.identityId`, dto.actorId)
            .where(`${TableName.IdentityOrgMembership}.orgId`, dto.orgId)
            .select(selectAllTableCols(TableName.Namespace))
            .select<(TNamespaces & { count: number })[]>(db.raw("COUNT(*) OVER() AS count"));

    const docs = await query
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

    const userMembershipSubquery = db(TableName.NamespaceMembership)
      .join(
        TableName.OrgMembership,
        `${TableName.OrgMembership}.id`,
        `${TableName.NamespaceMembership}.orgUserMembershipId`
      )
      .where({
        [`${TableName.OrgMembership}.userId` as "userId"]: dto.actorId,
        [`${TableName.OrgMembership}.orgId` as "orgId"]: dto.orgId
      })
      .select("namespaceId");

    const identityMembershipSubQuery = db(TableName.NamespaceMembership)
      .join(
        TableName.IdentityOrgMembership,
        `${TableName.IdentityOrgMembership}.id`,
        `${TableName.NamespaceMembership}.orgIdentityMembershipId`
      )
      .where({
        [`${TableName.IdentityOrgMembership}.identityId` as "identityId"]: dto.actorId,
        [`${TableName.IdentityOrgMembership}.orgId` as "orgId"]: dto.orgId
      })
      .select("namespaceId");

    // Get the SQL strings for the subqueries
    const userMembershipSql = userMembershipSubquery.toQuery();
    const identityMembershipSql = identityMembershipSubQuery.toQuery();

    const query = db
      .replicaNode()(TableName.Namespace)
      .where(`${TableName.Namespace}.orgId`, dto.orgId)
      .select(selectAllTableCols(TableName.Namespace))
      .select(db.raw("COUNT(*) OVER() AS count"))
      .select<(TNamespaces & { isMember: boolean; count: number })[]>(
        dto.actor === ActorType.USER
          ? db.raw(
              `
            CASE
              WHEN ${TableName.Namespace}.id IN (?) THEN TRUE
              ELSE FALSE
            END as "isMember"
          `,
              [db.raw(userMembershipSql)]
            )
          : db.raw(
              `
            CASE
              WHEN ${TableName.Namespace}.id IN (?) THEN TRUE
              ELSE FALSE
            END as "isMember"
          `,
              [db.raw(identityMembershipSql)]
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
