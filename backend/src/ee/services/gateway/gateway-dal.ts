import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { GatewaysSchema, TableName, TGateways } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import {
  buildFindFilter,
  ormify,
  selectAllTableCols,
  sqlNestRelationships,
  TFindFilter,
  TFindOpt
} from "@app/lib/knex";

export type TGatewayDALFactory = ReturnType<typeof gatewayDALFactory>;

export const gatewayDALFactory = (db: TDbClient) => {
  const orm = ormify(db, TableName.Gateway);

  const find = async (filter: TFindFilter<TGateways>, { offset, limit, sort, tx }: TFindOpt<TGateways> = {}) => {
    try {
      const query = (tx || db)(TableName.Gateway)
        // eslint-disable-next-line @typescript-eslint/no-misused-promises
        .where(buildFindFilter(filter))
        .join(TableName.Identity, `${TableName.Identity}.id`, `${TableName.Gateway}.identityId`)
        .leftJoin(TableName.ProjectGateway, `${TableName.ProjectGateway}.gatewayId`, `${TableName.Gateway}.id`)
        .leftJoin(TableName.Project, `${TableName.Project}.id`, `${TableName.ProjectGateway}.projectId`)
        .select(selectAllTableCols(TableName.Gateway))
        .select(
          db.ref("name").withSchema(TableName.Identity).as("identityName"),
          db.ref("name").withSchema(TableName.Project).as("projectName"),
          db.ref("slug").withSchema(TableName.Project).as("projectSlug"),
          db.ref("id").withSchema(TableName.Project).as("projectId")
        );
      if (limit) void query.limit(limit);
      if (offset) void query.offset(offset);
      if (sort) {
        void query.orderBy(sort.map(([column, order, nulls]) => ({ column: column as string, order, nulls })));
      }

      const docs = await query;
      return sqlNestRelationships({
        data: docs,
        key: "id",
        parentMapper: (data) => ({
          ...GatewaysSchema.parse(data),
          identity: { id: data.identityId, name: data.identityName }
        }),
        childrenMapper: [
          {
            key: "projectId",
            label: "projects" as const,
            mapper: ({ projectId, projectName, projectSlug }) => ({
              id: projectId,
              name: projectName,
              slug: projectSlug
            })
          }
        ]
      });
    } catch (error) {
      throw new DatabaseError({ error, name: `${TableName.Gateway}: Find` });
    }
  };

  const findByProjectId = async (projectId: string, tx?: Knex) => {
    try {
      const query = (tx || db)(TableName.Gateway)
        .join(TableName.Identity, `${TableName.Identity}.id`, `${TableName.Gateway}.identityId`)
        .join(TableName.ProjectGateway, `${TableName.ProjectGateway}.gatewayId`, `${TableName.Gateway}.id`)
        .select(selectAllTableCols(TableName.Gateway))
        .select(
          db.ref("name").withSchema(TableName.Identity).as("identityName"),
          db.ref("id").withSchema(TableName.ProjectGateway).as("projectGatewayId")
        )
        .where({ [`${TableName.ProjectGateway}.projectId` as "projectId"]: projectId });

      const docs = await query;
      return docs.map((el) => ({ ...el, identity: { id: el.identityId, name: el.identityName } }));
    } catch (error) {
      throw new DatabaseError({ error, name: `${TableName.Gateway}: Find by project id` });
    }
  };

  return { ...orm, find, findByProjectId };
};
