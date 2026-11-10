import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { BadRequestError, DatabaseError } from "@app/lib/errors";
import { ormify } from "@app/lib/knex";

import {
  AUTO_APPROVAL_AI_SUBJECT,
  AUTO_APPROVAL_REQUESTER_SUBJECT,
  TAutoApprovalConfig,
  TStoredAutoApproval
} from "./auto-approval-types";

const toValues = (values: unknown) =>
  Array.isArray(values) ? values.filter((value): value is string => typeof value === "string") : [];

export type TApprovalPolicyAutoApprovalDALFactory = ReturnType<typeof approvalPolicyAutoApprovalDALFactory>;

export const approvalPolicyAutoApprovalDALFactory = (db: TDbClient) => {
  const inputsOrm = ormify(db, TableName.ApprovalPolicyAutoApprovalInputs);
  const rulesOrm = ormify(db, TableName.ApprovalPolicyAutoApprovalRules);
  const conditionsOrm = ormify(db, TableName.ApprovalPolicyAutoApprovalConditions);
  const contextsOrm = ormify(db, TableName.ApprovalPolicyAutoApprovalConditionContexts);

  const findByPolicyIds = async (policyIds: string[], tx?: Knex): Promise<Map<string, TStoredAutoApproval>> => {
    const byPolicyId = new Map<string, TStoredAutoApproval>();
    if (!policyIds.length) return byPolicyId;

    try {
      const dbInstance = tx || db.replicaNode();

      const inputs = await dbInstance(TableName.ApprovalPolicyAutoApprovalInputs)
        .whereIn("policyId", policyIds)
        .orderBy("position", "asc");
      const rules = await dbInstance(TableName.ApprovalPolicyAutoApprovalRules)
        .whereIn("policyId", policyIds)
        .orderBy("position", "asc");
      const conditions = rules.length
        ? await dbInstance(TableName.ApprovalPolicyAutoApprovalConditions)
            .whereIn(
              "ruleId",
              rules.map((rule) => rule.id)
            )
            .orderBy("position", "asc")
        : [];
      const contexts = conditions.length
        ? await dbInstance(TableName.ApprovalPolicyAutoApprovalConditionContexts)
            .whereIn(
              "conditionId",
              conditions.map((condition) => condition.id)
            )
            .orderBy("position", "asc")
        : [];

      const inputById = new Map(inputs.map((input) => [input.id, input]));
      const getEntry = (policyId: string) => {
        let entry = byPolicyId.get(policyId);
        if (!entry) {
          entry = { inputs: [], rules: [] };
          byPolicyId.set(policyId, entry);
        }
        return entry;
      };

      inputs.forEach((input) => {
        getEntry(input.policyId).inputs.push({
          id: input.id,
          connectionId: input.connectionId,
          subject: input.subject
        });
      });

      rules.forEach((rule) => {
        getEntry(rule.policyId).rules.push({
          id: rule.id,
          name: rule.name,
          conditions: conditions
            .filter((condition) => condition.ruleId === rule.id)
            .map((condition) => {
              const input = condition.inputId ? inputById.get(condition.inputId) : undefined;
              const isAi = condition.prompt !== null && condition.prompt !== undefined;
              let subject = input?.subject ?? AUTO_APPROVAL_REQUESTER_SUBJECT;
              if (isAi) subject = AUTO_APPROVAL_AI_SUBJECT;
              return {
                id: condition.id,
                inputId: condition.inputId ?? null,
                connectionId: input?.connectionId ?? condition.connectionId ?? null,
                subject,
                constraint: condition.constraint,
                values: toValues(condition.values),
                prompt: condition.prompt ?? null,
                contextConnectionIds: contexts
                  .filter((context) => context.conditionId === condition.id)
                  .map((context) => context.connectionId)
              };
            })
        });
      });

      return byPolicyId;
    } catch (error) {
      throw new DatabaseError({ error, name: "Find approval policy auto-approval rules" });
    }
  };

  // Replaces a policy's inputs and rules, the way policy steps are replaced
  const replaceForPolicy = async (policyId: string, config: TAutoApprovalConfig, tx: Knex) => {
    await rulesOrm.delete({ policyId }, tx);
    await inputsOrm.delete({ policyId }, tx);

    const inputs = await inputsOrm.insertMany(
      config.inputs.map((input, position) => ({
        policyId,
        position,
        connectionId: input.connectionId,
        subject: input.subject
      })),
      tx
    );
    const inputIdByKey = new Map(inputs.map((input) => [`${input.connectionId}:${input.subject}`, input.id]));

    const rules = await rulesOrm.insertMany(
      config.rules.map((rule, position) => ({ policyId, position, name: rule.name })),
      tx
    );
    const ruleIdByPosition = new Map(rules.map((rule) => [rule.position, rule.id]));

    const conditionRows = config.rules.flatMap((rule, rulePosition) =>
      rule.conditions.map((condition, position) => {
        if (condition.subject === AUTO_APPROVAL_AI_SUBJECT) {
          return {
            ruleId: ruleIdByPosition.get(rulePosition) as string,
            position,
            inputId: null,
            connectionId: null,
            constraint: condition.constraint,
            values: JSON.stringify(condition.values),
            prompt: condition.prompt ?? ""
          };
        }

        const isRequester = condition.subject === AUTO_APPROVAL_REQUESTER_SUBJECT;
        const inputId = isRequester ? null : inputIdByKey.get(`${condition.connectionId}:${condition.subject}`);
        if (!isRequester && !inputId) {
          throw new BadRequestError({
            message: `Rule '${rule.name}' checks '${condition.subject}', which is not in the policy's request form fields`
          });
        }

        return {
          ruleId: ruleIdByPosition.get(rulePosition) as string,
          position,
          inputId: inputId ?? null,
          connectionId: isRequester ? (condition.connectionId ?? null) : null,
          constraint: condition.constraint,
          values: JSON.stringify(condition.values)
        };
      })
    );

    const conditions = await conditionsOrm.insertMany(conditionRows, tx);
    const conditionIdByPosition = new Map(
      conditions.map((condition) => [`${condition.ruleId}:${condition.position}`, condition.id])
    );

    const contextRows = config.rules.flatMap((rule, rulePosition) =>
      rule.conditions.flatMap((condition, position) =>
        (condition.contextConnectionIds ?? []).map((connectionId, contextPosition) => ({
          conditionId: conditionIdByPosition.get(`${ruleIdByPosition.get(rulePosition)}:${position}`) as string,
          position: contextPosition,
          connectionId
        }))
      )
    );
    if (contextRows.length) await contextsOrm.insertMany(contextRows, tx);
  };

  return { findByPolicyIds, replaceForPolicy };
};
