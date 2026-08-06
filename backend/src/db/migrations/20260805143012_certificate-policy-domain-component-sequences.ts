import { Knex } from "knex";

import { initLogger, logger } from "@app/lib/logger";

import { TableName } from "../schemas";
import { rewriteJsonColumnInBatches } from "./utils/rewrite-json-column";

const DOMAIN_COMPONENT_ATTRIBUTE_TYPE = "domain_component";
const ORDERED_RULE_FIELDS = ["allowed", "required"] as const;
const DENIED_RULE_FIELD = "denied";

type TRewriteField = (values: unknown) => string[] | string[][] | undefined;

type TStoredSubjectRule = {
  type?: string;
  allowed?: unknown;
  required?: unknown;
  denied?: unknown;
};

const isFlatLabelList = (values: unknown): values is string[] =>
  Array.isArray(values) && values.length > 0 && values.every((value) => typeof value === "string");

const isSingleSequence = (values: unknown): values is [string[]] =>
  Array.isArray(values) && values.length === 1 && isFlatLabelList(values[0]);

const isSingleLabelSequenceList = (values: unknown): values is string[][] =>
  Array.isArray(values) &&
  values.length > 0 &&
  values.every((value) => Array.isArray(value) && value.length === 1 && typeof value[0] === "string");

const rewriteDomainComponentRule =
  (rewriteOrderedField: TRewriteField, rewriteDeniedField: TRewriteField) =>
  (subject: TStoredSubjectRule[]): TStoredSubjectRule[] | undefined => {
    if (!Array.isArray(subject)) return undefined;

    let changed = false;
    const rewrittenRules = subject.map((rule) => {
      if (rule?.type !== DOMAIN_COMPONENT_ATTRIBUTE_TYPE) return rule;

      const rewrittenRule = { ...rule };
      const fields = [
        ...ORDERED_RULE_FIELDS.map((field) => [field, rewriteOrderedField] as const),
        [DENIED_RULE_FIELD, rewriteDeniedField] as const
      ];
      for (const [field, rewriteField] of fields) {
        const rewritten = rewriteField(rewrittenRule[field]);
        if (rewritten !== undefined) {
          rewrittenRule[field] = rewritten;
          changed = true;
        }
      }
      return rewrittenRule;
    });

    return changed ? rewrittenRules : undefined;
  };

const narrowToDomainComponentPolicies = (query: Knex.QueryBuilder) => {
  void query.whereNotNull("subject").whereRaw(`subject::text LIKE ?`, [`%${DOMAIN_COMPONENT_ATTRIBUTE_TYPE}%`]);
};

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable(TableName.PkiCertificatePolicy))) return;

  initLogger();

  const migratedCount = await rewriteJsonColumnInBatches<TStoredSubjectRule[]>({
    knex,
    table: TableName.PkiCertificatePolicy,
    column: "subject",
    narrow: narrowToDomainComponentPolicies,
    rewrite: rewriteDomainComponentRule(
      (values) => (isFlatLabelList(values) ? [values] : undefined),
      (values) => (isFlatLabelList(values) ? values.map((label) => [label]) : undefined)
    )
  });

  if (migratedCount) {
    logger.info(`Migrated certificate policy domain component rules to ordered sequences [count=${migratedCount}]`);
  }
}

export async function down(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable(TableName.PkiCertificatePolicy))) return;

  await rewriteJsonColumnInBatches<TStoredSubjectRule[]>({
    knex,
    table: TableName.PkiCertificatePolicy,
    column: "subject",
    narrow: narrowToDomainComponentPolicies,
    rewrite: rewriteDomainComponentRule(
      (values) => (isSingleSequence(values) ? values[0] : undefined),
      (values) => (isSingleLabelSequenceList(values) ? values.map(([label]) => label) : undefined)
    )
  });
}
