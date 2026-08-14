import { Knex } from "knex";

import { initLogger, logger } from "@app/lib/logger";

import { TableName } from "../schemas";

const SUBJECT_RULES = `jsonb_array_elements(CASE WHEN jsonb_typeof(subject) = 'array' THEN subject ELSE '[]'::jsonb END)`;

const isLabelList = (field: string) => `
  jsonb_array_length(COALESCE(rule->'${field}', '[]'::jsonb)) > 1
  AND NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements_text(rule->'${field}') AS label WHERE label LIKE '%,%'
  )
`;

const joinDomainComponentLabels = (field: string) => `
  UPDATE ${TableName.PkiCertificatePolicy}
  SET subject = (
    SELECT jsonb_agg(
      CASE
        WHEN rule->>'type' = 'domain_component' AND ${isLabelList(field)}
        THEN jsonb_set(
          rule,
          '{${field}}',
          jsonb_build_array(
            (
              SELECT string_agg(label, ',' ORDER BY ordinality)
              FROM jsonb_array_elements_text(rule->'${field}') WITH ORDINALITY AS labels(label, ordinality)
            )
          )
        )
        ELSE rule
      END
      ORDER BY position
    )
    FROM ${SUBJECT_RULES} WITH ORDINALITY AS rules(rule, position)
  )
  WHERE jsonb_typeof(subject) = 'array'
    AND EXISTS (
      SELECT 1
      FROM ${SUBJECT_RULES} AS rule
      WHERE rule->>'type' = 'domain_component'
        AND ${isLabelList(field)}
    )
`;

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable(TableName.PkiCertificatePolicy))) return;

  initLogger();

  for (const field of ["allowed", "required"]) {
    // eslint-disable-next-line no-await-in-loop
    const { rowCount } = await knex.raw<{ rowCount: number }>(joinDomainComponentLabels(field));
    if (rowCount) {
      logger.info(
        `Joined certificate policy domain component labels into sequences [field=${field}] [policies=${rowCount}]`
      );
    }
  }
}

export async function down(): Promise<void> {
  // a joined sequence holds the same characters as the labels it was built from, so there is nothing to undo
}
