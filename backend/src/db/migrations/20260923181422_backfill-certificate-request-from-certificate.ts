import { Knex } from "knex";

import { TableName } from "../schemas";

const BACKFILL_BATCH_SIZE = 5_000;
const MAX_BACKFILL_BATCHES = 10_000;
const SUBJECT_PASSTHROUGH_EXTERNAL_CA_TYPE = "aws-pca";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable(TableName.CertificateRequests))) return;

  const gapPredicate = `(EXISTS (SELECT 1 FROM ?? AS i WHERE i."caId" = c."caId")
       OR EXISTS (SELECT 1 FROM ?? AS e WHERE e."caId" = c."caId" AND e.type = ?))
     AND ((r.organization IS NULL AND c."subjectOrganization" IS NOT NULL)
       OR (r."organizationalUnit" IS NULL AND c."subjectOrganizationalUnit" IS NOT NULL)
       OR (r.country IS NULL AND c."subjectCountry" IS NOT NULL)
       OR (r.state IS NULL AND c."subjectState" IS NOT NULL)
       OR (r.locality IS NULL AND c."subjectLocality" IS NOT NULL))`;

  for (let batch = 0; batch < MAX_BACKFILL_BATCHES; batch += 1) {
    // eslint-disable-next-line no-await-in-loop
    const result = await knex.raw(
      `UPDATE ?? AS r SET
         organization = COALESCE(r.organization, c."subjectOrganization"),
         "organizationalUnit" = COALESCE(r."organizationalUnit", c."subjectOrganizationalUnit"),
         country = COALESCE(r.country, c."subjectCountry"),
         state = COALESCE(r.state, c."subjectState"),
         locality = COALESCE(r.locality, c."subjectLocality")
       FROM ?? AS c
       WHERE c.id = r."certificateId"
         AND ${gapPredicate}
         AND r.id IN (
           SELECT r2.id FROM ?? AS r2
           JOIN ?? AS c2 ON c2.id = r2."certificateId"
           WHERE (EXISTS (SELECT 1 FROM ?? AS i2 WHERE i2."caId" = c2."caId")
             OR EXISTS (SELECT 1 FROM ?? AS e2 WHERE e2."caId" = c2."caId" AND e2.type = ?))
             AND ((r2.organization IS NULL AND c2."subjectOrganization" IS NOT NULL)
               OR (r2."organizationalUnit" IS NULL AND c2."subjectOrganizationalUnit" IS NOT NULL)
               OR (r2.country IS NULL AND c2."subjectCountry" IS NOT NULL)
               OR (r2.state IS NULL AND c2."subjectState" IS NOT NULL)
               OR (r2.locality IS NULL AND c2."subjectLocality" IS NOT NULL))
           LIMIT ?
         )`,
      [
        TableName.CertificateRequests,
        TableName.Certificate,
        TableName.InternalCertificateAuthority,
        TableName.ExternalCertificateAuthority,
        SUBJECT_PASSTHROUGH_EXTERNAL_CA_TYPE,
        TableName.CertificateRequests,
        TableName.Certificate,
        TableName.InternalCertificateAuthority,
        TableName.ExternalCertificateAuthority,
        SUBJECT_PASSTHROUGH_EXTERNAL_CA_TYPE,
        BACKFILL_BATCH_SIZE
      ]
    );

    if (!result.rowCount) break;
  }
}

export async function down(): Promise<void> {}

const config = { transaction: false };
export { config };
