import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName, TSecretValidationRules } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { buildFindFilter, ormify, prependTableNameToFindFilter, selectAllTableCols } from "@app/lib/knex";

import { SecretValidationRuleType } from "./secret-validation-rule-enums";

export type TSecretValidationRuleDALFactory = ReturnType<typeof secretValidationRuleDALFactory>;

type TFilter = Parameters<typeof buildFindFilter<TSecretValidationRules>>[0];

const baseQuery = ({ db, filter, tx }: { db: TDbClient; filter?: TFilter; tx?: Knex }) => {
  const query = (tx || db.replicaNode())(TableName.SecretValidationRule)
    .leftJoin(TableName.Environment, `${TableName.SecretValidationRule}.envId`, `${TableName.Environment}.id`)
    .join(TableName.Project, `${TableName.SecretValidationRule}.projectId`, `${TableName.Project}.id`)
    .whereNull(`${TableName.Project}.deleteAfter`)
    .select(selectAllTableCols(TableName.SecretValidationRule))
    .select(
      db.ref("name").withSchema(TableName.Environment).as("envName"),
      db.ref("slug").withSchema(TableName.Environment).as("envSlug")
    );

  if (filter) {
    /* eslint-disable @typescript-eslint/no-misused-promises */
    void query.where(buildFindFilter(prependTableNameToFindFilter(TableName.SecretValidationRule, filter)));
  }

  return query;
};

const expandRule = (rule: TSecretValidationRules & { envName: string; envSlug: string }) => {
  const { envId, envName, envSlug, type, ...el } = rule;

  return {
    ...el,
    envId: envId ?? null,
    type: type as SecretValidationRuleType,
    environment: envId ? { id: envId, name: envName, slug: envSlug } : null
  };
};

export const secretValidationRuleDALFactory = (db: TDbClient) => {
  const orm = ormify(db, TableName.SecretValidationRule);

  const findWithEnv = async (filter: TFilter, tx?: Knex) => {
    try {
      const rules = await baseQuery({ db, filter, tx });
      return rules.map(expandRule);
    } catch (error) {
      throw new DatabaseError({ error, name: "Find - Secret Validation Rule" });
    }
  };

  const findOneWithEnv = async (filter: TFilter, tx?: Knex) => {
    try {
      const rule = await baseQuery({ db, filter, tx }).first();
      return rule ? expandRule(rule) : undefined;
    } catch (error) {
      throw new DatabaseError({ error, name: "Find One - Secret Validation Rule" });
    }
  };

  const createWithEnv = async (data: Parameters<(typeof orm)["create"]>[0]) => {
    const rule = await orm.transaction(async (tx) => {
      const created = await orm.create(data, tx);
      return baseQuery({ db, filter: { id: created.id }, tx }).first();
    });
    return expandRule(rule!);
  };

  const updateByIdWithEnv = async (ruleId: string, data: Parameters<(typeof orm)["updateById"]>[1]) => {
    const rule = await orm.transaction(async (tx) => {
      await orm.updateById(ruleId, data, tx);
      return baseQuery({ db, filter: { id: ruleId }, tx }).first();
    });
    return expandRule(rule!);
  };

  return { ...orm, findWithEnv, findOneWithEnv, createWithEnv, updateByIdWithEnv };
};
