import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName,TWebhooks } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify, selectAllTableCols } from "@app/lib/knex";

export type TWebhookDalFactory = ReturnType<typeof webhookDalFactory>;

export const webhookDalFactory = (db: TDbClient) => {
  const webhookOrm = ormify(db, TableName.Webhook);

  const webhookFindQuery = (tx: Knex, filter: Partial<TWebhooks>) =>
    tx(TableName.Webhook)
      .where(filter)
      .join(TableName.Environment, `${TableName.Webhook}.envId`, `${TableName.Environment}.id`)
      .select(tx.ref("name").withSchema(TableName.Environment).as("envName"))
      .select(tx.ref("slug").withSchema(TableName.Environment).as("envSlug"))
      .select(tx.ref("id").withSchema(TableName.Environment).as("envId"))
      .select(tx.ref("projectId").withSchema(TableName.Environment))
      .select(selectAllTableCols(TableName.Integration));

  const find = async (filter: Partial<TWebhooks>, tx?: Knex) => {
    try {
      const docs = await webhookFindQuery(tx || db, filter);
      return docs.map(({ envId, envSlug, envName, ...el }) => ({
        ...el,
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
      const doc = await webhookFindQuery(tx || db, filter).first();
      if (!doc) return;

      const { envName: name, envSlug: slug, envId: id, ...el } = doc;
      return { ...el, environment: { id, name, slug } };
    } catch (error) {
      throw new DatabaseError({ error, name: "Find one webhook" });
    }
  };

  const findById = async (id: string, tx?: Knex) => {
    try {
      const doc = await webhookFindQuery(tx || db, { id }).first();
      if (!doc) return;

      const { envName: name, envSlug: slug, envId, ...el } = doc;
      return { ...el, environment: { id: envId, name, slug } };
    } catch (error) {
      throw new DatabaseError({ error, name: "Find by id webhook" });
    }
  };

  const findAllWebhooks = async (
    projectId: string,
    environment?: string,
    secretPath?: string,
    tx?: Knex
  ) => {
    try {
      const webhooks = await (tx || db)(TableName.Webhook)
        .where(`${TableName.Environment}.projectId`, projectId)
        .where((qb) => {
          if (environment) {
            qb.where("slug", environment);
          }
          if (secretPath) {
            qb.where("secretPath", secretPath);
          }
        })
        .join(TableName.Environment, `${TableName.Webhook}.envId`, `${TableName.Environment}.id`)
        .select(db.ref("name").withSchema(TableName.Environment).as("envName"))
        .select(db.ref("slug").withSchema(TableName.Environment).as("envSlug"))
        .select(db.ref("id").withSchema(TableName.Environment).as("envId"))
        .select(db.ref("projectId").withSchema(TableName.Environment))
        .select(selectAllTableCols(TableName.Integration));

      return webhooks;
    } catch (error) {
      throw new DatabaseError({ error, name: "Find all webhooks" });
    }
  };

  return { ...webhookOrm, findById, findOne, find, findAllWebhooks };
};
