import slugify from "@sindresorhus/slugify";
import { Knex } from "knex";

import { alphaNumericNanoId } from "@app/lib/nanoid";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  const hasNameCol = await knex.schema.hasColumn(TableName.CertificateTemplate, "name");
  if (hasNameCol) {
    const templates = await knex(TableName.CertificateTemplate).select("id", "name");
    await Promise.all(
      templates.map((el) => {
        const slugifiedName = el.name
          ? slugify(`${el.name.slice(0, 16)}-${alphaNumericNanoId(8)}`)
          : slugify(alphaNumericNanoId(12));

        return knex(TableName.CertificateTemplate).where({ id: el.id }).update({ name: slugifiedName });
      })
    );
  }
}

export async function down(): Promise<void> {}
