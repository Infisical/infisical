import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName, TIntegrations } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify, selectAllTableCols } from "@app/lib/knex";

export type TIntegrationDalFactory = ReturnType<typeof integrationDalFactory>;

export const integrationDalFactory = (db: TDbClient) => {
  const integrationOrm = ormify(db, TableName.Integration);

  const integrationFindQuery = (tx: Knex, filter: Partial<TIntegrations>) =>
    tx(TableName.Integration)
      .where(filter)
      .join(TableName.Environment, `${TableName.Integration}.envId`, `${TableName.Environment}.id`)
      .select(tx.ref("name").withSchema(TableName.Environment).as("envName"))
      .select(tx.ref("slug").withSchema(TableName.Environment).as("envSlug"))
      .select(tx.ref("id").withSchema(TableName.Environment).as("envId"))
      .select(tx.ref("projectId").withSchema(TableName.Environment))
      .select(selectAllTableCols(TableName.Integration));

  const find = async (filter: Partial<TIntegrations>, tx?: Knex) => {
    try {
      const docs = await integrationFindQuery(tx || db, filter);
      return docs.map(({ envId, envSlug, envName, ...el }) => ({
        ...el,
        environment: {
          id: envId,
          slug: envSlug,
          name: envName
        }
      }));
    } catch (error) {
      throw new DatabaseError({ error, name: "Find by id integrations" });
    }
  };

  const findOne = async (filter: Partial<TIntegrations>, tx?: Knex) => {
    try {
      const doc = await integrationFindQuery(tx || db, filter).first();
      if (!doc) return;

      const { envName: name, envSlug: slug, envId: id, ...el } = doc;
      return { ...el, environment: { id, name, slug } };
    } catch (error) {
      throw new DatabaseError({ error, name: "Find one integrations" });
    }
  };

  const findById = async (id: string, tx?: Knex) => {
    try {
      const doc = await integrationFindQuery(tx || db, { id }).first();
      if (!doc) return;

      const { envName: name, envSlug: slug, envId, ...el } = doc;
      return { ...el, environment: { id: envId, name, slug } };
    } catch (error) {
      throw new DatabaseError({ error, name: "Find by id integrations" });
    }
  };

  const findByProjectId = async (projectId: string, tx?: Knex) => {
    try {
      const integrations = await (tx || db)(TableName.Integration)
        .where(`${TableName.Environment}.projectId`, projectId)
        .join(
          TableName.Environment,
          `${TableName.Integration}.envId`,
          `${TableName.Environment}.id`
        )
        .select(db.ref("name").withSchema(TableName.Environment).as("envName"))
        .select(db.ref("slug").withSchema(TableName.Environment).as("envSlug"))
        .select(db.ref("id").withSchema(TableName.Environment).as("envId"))
        .select(db.ref("projectId").withSchema(TableName.Environment))
        .select(selectAllTableCols(TableName.Integration));

      return integrations.map(({ envId, envSlug, envName, ...el }) => ({
        ...el,
        envId,
        environment: {
          id: envId,
          slug: envSlug,
          name: envName
        }
      }));
    } catch (error) {
      throw new DatabaseError({ error, name: "FindByProjectId" });
    }
  };

  return { ...integrationOrm, find, findOne, findById, findByProjectId };
};
