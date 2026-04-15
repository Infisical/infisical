import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { ormify, selectAllTableCols } from "@app/lib/knex";

export type TEmailDomainDALFactory = ReturnType<typeof emailDomainDALFactory>;

export const emailDomainDALFactory = (db: TDbClient) => {
  const emailDomainOrm = ormify(db, TableName.EmailDomains);

  const findByFilter = async ({
    offset,
    limit,
    searchTerm
  }: {
    offset: number;
    limit: number;
    searchTerm?: string;
  }) => {
    const query = db
      .replicaNode()(TableName.EmailDomains)
      .leftJoin(TableName.Organization, `${TableName.EmailDomains}.orgId`, `${TableName.Organization}.id`)
      .select(
        selectAllTableCols(TableName.EmailDomains),
        db.ref("name").withSchema(TableName.Organization).as("orgName")
      );

    if (searchTerm) {
      void query.where((qb) => {
        void qb
          .where(`${TableName.EmailDomains}.domain`, "ilike", `%${searchTerm}%`)
          .orWhere(`${TableName.Organization}.name`, "ilike", `%${searchTerm}%`);
      });
    }

    const countQuery = query.clone().clearSelect().count(`${TableName.EmailDomains}.id as count`).first();
    const domains = await query.clone().orderBy(`${TableName.EmailDomains}.domain`, "asc").limit(limit).offset(offset);
    const countResult = (await countQuery) as { count?: string } | undefined;

    return { emailDomains: domains, total: Number(countResult?.count || 0) };
  };

  return { ...emailDomainOrm, findByFilter };
};
