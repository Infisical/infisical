import { Knex } from "knex";
import { Tables } from "knex/types/tables";

import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas/models";
import { DatabaseError } from "@app/lib/errors";
import { buildFindFilter, ormify, selectAllTableCols, TFindFilter, TFindOpt } from "@app/lib/knex";

export type TPkiTemplatesDALFactory = ReturnType<typeof pkiTemplatesDALFactory>;

export const pkiTemplatesDALFactory = (db: TDbClient) => {
  const orm = ormify(db, TableName.CertificateTemplate);

  const findOne = async (
    filter: Partial<Tables[TableName.CertificateTemplate]["base"] & { projectId: string }>,
    tx?: Knex
  ) => {
    try {
      const { projectId, ...templateFilters } = filter;
      const res = await (tx || db.replicaNode())(TableName.CertificateTemplate)
        .join(
          TableName.CertificateAuthority,
          `${TableName.CertificateAuthority}.id`,
          `${TableName.CertificateTemplate}.caId`
        )
        // eslint-disable-next-line @typescript-eslint/no-misused-promises
        .where(buildFindFilter(templateFilters, TableName.CertificateTemplate))
        .where((qb) => {
          if (projectId) {
            // eslint-disable-next-line @typescript-eslint/no-misused-promises
            void qb.where(buildFindFilter({ projectId }, TableName.CertificateAuthority));
          }
        })
        .select(selectAllTableCols(TableName.CertificateTemplate))
        .select(db.ref("name").withSchema(TableName.CertificateAuthority).as("caName"))
        .select(db.ref("projectId").withSchema(TableName.CertificateAuthority))
        .first();

      if (!res) return undefined;

      return { ...res, ca: { id: res.caId, name: res.caName } };
    } catch (error) {
      throw new DatabaseError({ error, name: "Find one" });
    }
  };

  const find = async <
    TCount extends boolean = false,
    TCountDistinct extends keyof Tables[TableName.CertificateTemplate]["base"] | undefined = undefined
  >(
    filter: TFindFilter<Tables[TableName.CertificateTemplate]["base"]> & { projectId: string },
    {
      offset,
      limit,
      sort,
      count,
      tx,
      countDistinct
    }: TFindOpt<Tables[TableName.CertificateTemplate]["base"], TCount, TCountDistinct> = {}
  ) => {
    try {
      const { projectId, ...templateFilters } = filter;

      const query = (tx || db.replicaNode())(TableName.CertificateTemplate)
        .join(
          TableName.CertificateAuthority,
          `${TableName.CertificateAuthority}.id`,
          `${TableName.CertificateTemplate}.caId`
        )
        // eslint-disable-next-line @typescript-eslint/no-misused-promises
        .where(buildFindFilter(templateFilters, TableName.CertificateTemplate))
        .where((qb) => {
          if (projectId) {
            // eslint-disable-next-line @typescript-eslint/no-misused-promises
            void qb.where(buildFindFilter({ projectId }, TableName.CertificateAuthority));
          }
        })
        .select(selectAllTableCols(TableName.CertificateTemplate))
        .select(db.ref("projectId").withSchema(TableName.CertificateAuthority))
        .select(db.ref("name").withSchema(TableName.CertificateAuthority).as("caName"));

      if (countDistinct) {
        void query.countDistinct(countDistinct);
      } else if (count) {
        void query.select(db.raw("COUNT(*) OVER() AS count"));
      }

      if (limit) void query.limit(limit);
      if (offset) void query.offset(offset);
      if (sort) {
        void query.orderBy(sort.map(([column, order, nulls]) => ({ column: column as string, order, nulls })));
      }

      const res = (await query) as Array<Awaited<typeof query>[0] & { count: string }>;
      return res.map((el) => ({ ...el, ca: { id: el.caId, name: el.caName } }));
    } catch (error) {
      throw new DatabaseError({ error, name: "Find one" });
    }
  };

  return { ...orm, find, findOne };
};
