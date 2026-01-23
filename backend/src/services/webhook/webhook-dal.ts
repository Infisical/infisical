import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas/models";
import { TWebhooks, TWebhooksUpdate } from "@app/db/schemas/webhooks";
import { DatabaseError } from "@app/lib/errors";
import { ormify, selectAllTableCols } from "@app/lib/knex";

export type TWebhookDALFactory = ReturnType<typeof webhookDALFactory>;

export const webhookDALFactory = (db: TDbClient) => {
  const webhookOrm = ormify(db, TableName.Webhook);

  const webhookFindQuery = (tx: Knex, filter: Partial<TWebhooks>) =>
    tx(TableName.Webhook)
      .where(filter)
      .join(TableName.Environment, `${TableName.Webhook}.envId`, `${TableName.Environment}.id`)
      .select(tx.ref("name").withSchema(TableName.Environment).as("envName"))
      .select(tx.ref("slug").withSchema(TableName.Environment).as("envSlug"))
      .select(tx.ref("id").withSchema(TableName.Environment).as("envId"))
      .select(tx.ref("projectId").withSchema(TableName.Environment))
      .select(selectAllTableCols(TableName.Webhook));

  const find = async (filter: Partial<TWebhooks & { projectId: string }>, tx?: Knex) => {
    try {
      const docs = await webhookFindQuery(tx || db.replicaNode(), filter);
      return docs.map(({ envId, envSlug, envName, ...el }) => ({
        ...el,
        envId,
        environment: {
          id: envId,
          slug: envSlug,
          name: envName
        }
      }));
    } catch (error) {
      throw new DatabaseError({ error, name: "Find by id webhook" });
    }
  };

  const findOne = async (filter: Partial<TWebhooks>, tx?: Knex) => {
    try {
      const doc = await webhookFindQuery(tx || db.replicaNode(), filter).first();
      if (!doc) return;

      const { envName: name, envSlug: slug, envId: id, ...el } = doc;
      return { ...el, environment: { id, name, slug } };
    } catch (error) {
      throw new DatabaseError({ error, name: "Find one webhook" });
    }
  };

  const findById = async (id: string, tx?: Knex) => {
    try {
      const doc = await webhookFindQuery(tx || db.replicaNode(), {
        [`${TableName.Webhook}.id` as "id"]: id
      }).first();
      if (!doc) return;

      const { envName: name, envSlug: slug, envId, ...el } = doc;
      return { ...el, envId, environment: { id: envId, name, slug } };
    } catch (error) {
      throw new DatabaseError({ error, name: "Find by id webhook" });
    }
  };

  const findAllWebhooks = async (projectId: string, environment?: string, secretPath?: string, tx?: Knex) => {
    try {
      const webhooks = await (tx || db.replicaNode())(TableName.Webhook)
        .where(`${TableName.Environment}.projectId`, projectId)
        .where((qb) => {
          if (environment) {
            void qb.where("slug", environment);
          }
          if (secretPath) {
            void qb.where("secretPath", secretPath);
          }
        })
        .join(TableName.Environment, `${TableName.Webhook}.envId`, `${TableName.Environment}.id`)
        .select(db.ref("name").withSchema(TableName.Environment).as("envName"))
        .select(db.ref("slug").withSchema(TableName.Environment).as("envSlug"))
        .select(db.ref("id").withSchema(TableName.Environment).as("envId"))
        .select(db.ref("projectId").withSchema(TableName.Environment))
        .select(selectAllTableCols(TableName.Webhook))
        .orderBy(`${TableName.Webhook}.createdAt`, "asc");

      return webhooks.map(({ envId, envSlug, envName, ...el }) => ({
        ...el,
        envId,
        environment: {
          id: envId,
          slug: envSlug,
          name: envName
        }
      }));
    } catch (error) {
      throw new DatabaseError({ error, name: "Find all webhooks" });
    }
  };

  const bulkUpdate = async (data: Array<TWebhooksUpdate & { id: string }>, tx?: Knex) => {
    try {
      const queries = data.map(({ id, ...el }) => (tx || db)(TableName.Webhook).where({ id }).update(el));
      const docs = await Promise.all(queries);
      return docs;
    } catch (error) {
      throw new DatabaseError({ error, name: "bulk update secret" });
    }
  };

  return { ...webhookOrm, findById, findOne, find, findAllWebhooks, bulkUpdate };
};
