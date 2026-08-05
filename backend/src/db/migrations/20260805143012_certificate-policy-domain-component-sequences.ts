import { Knex } from "knex";

import { initLogger, logger } from "@app/lib/logger";

import { TableName } from "../schemas";
import { rewriteJsonColumnInBatches } from "./utils/rewrite-json-column";

const DOMAIN_COMPONENT_ATTRIBUTE_TYPE = "domain_component";
const RULE_FIELDS = ["allowed", "required", "denied"] as const;

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

const rewriteDomainComponentRule =
  (rewriteField: (values: unknown) => string[] | string[][] | undefined) =>
  (subject: TStoredSubjectRule[]): TStoredSubjectRule[] | undefined => {
    if (!Array.isArray(subject)) return undefined;

    let changed = false;
    const rewrittenRules = subject.map((rule) => {
      if (rule?.type !== DOMAIN_COMPONENT_ATTRIBUTE_TYPE) return rule;

      const rewrittenRule = { ...rule };
      for (const field of RULE_FIELDS) {
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
    rewrite: rewriteDomainComponentRule((values) => (isFlatLabelList(values) ? [values] : undefined))
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
    rewrite: rewriteDomainComponentRule((values) => (isSingleSequence(values) ? values[0] : undefined))
  });
}
