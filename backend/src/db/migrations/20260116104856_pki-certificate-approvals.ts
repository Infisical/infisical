import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  const hasApprovalRequestIdCol = await knex.schema.hasColumn(TableName.CertificateRequests, "approvalRequestId");

  if (!hasApprovalRequestIdCol) {
    await knex.schema.alterTable(TableName.CertificateRequests, (t) => {
      t.uuid("approvalRequestId").nullable();
      t.foreign("approvalRequestId").references("id").inTable(TableName.ApprovalRequests).onDelete("CASCADE");

      t.string("ttl").nullable();
      t.string("enrollmentType").nullable();
      t.jsonb("altNamesJson").nullable();

      t.string("organization").nullable();
      t.string("organizationalUnit").nullable();
      t.string("country").nullable();
      t.string("state").nullable();
      t.string("locality").nullable();

      t.index("approvalRequestId");
    });

    // Migrate existing altNames string data to altNamesJson
    await knex.raw(`
      UPDATE ${TableName.CertificateRequests}
      SET "altNamesJson" = (
        SELECT jsonb_agg(
          jsonb_build_object(
            'type',
            CASE
              WHEN trim(san) ~ '^[0-9]+\\.[0-9]+\\.[0-9]+\\.[0-9]+$' THEN 'ip'
              WHEN trim(san) ~ '^[0-9a-fA-F:]+$' THEN 'ip'
              WHEN trim(san) ~ '^[^@]+@[^@]+\\.[^@]+$' THEN 'email'
              ELSE 'dns'
            END,
            'value', trim(san)
          )
        )
        FROM unnest(string_to_array("altNames", ',')) AS san
        WHERE trim(san) != ''
      )
      WHERE "altNames" IS NOT NULL
        AND "altNames" != ''
        AND "altNamesJson" IS NULL
    `);

    await knex.schema.alterTable(TableName.CertificateRequests, (t) => {
      t.dropColumn("altNames");
    });

    await knex.schema.alterTable(TableName.CertificateRequests, (t) => {
      t.renameColumn("altNamesJson", "altNames");
    });
  }

  const hasMachineIdentityIdCol = await knex.schema.hasColumn(TableName.ApprovalRequests, "machineIdentityId");
  if (!hasMachineIdentityIdCol) {
    await knex.schema.alterTable(TableName.ApprovalRequests, (t) => {
      t.uuid("machineIdentityId").nullable().index();
      t.foreign("machineIdentityId").references("id").inTable(TableName.Identity).onDelete("SET NULL");
    });
  }

  const hasBypassCol = await knex.schema.hasColumn(TableName.ApprovalPolicies, "bypassForMachineIdentities");
  if (!hasBypassCol) {
    await knex.schema.alterTable(TableName.ApprovalPolicies, (t) => {
      t.boolean("bypassForMachineIdentities").defaultTo(false);
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasApprovalRequestIdCol = await knex.schema.hasColumn(TableName.CertificateRequests, "approvalRequestId");

  if (hasApprovalRequestIdCol) {
    await knex.schema.alterTable(TableName.CertificateRequests, (t) => {
      t.renameColumn("altNames", "altNamesJson");
    });

    await knex.schema.alterTable(TableName.CertificateRequests, (t) => {
      t.text("altNames").nullable();
    });

    await knex.raw(`
      UPDATE ${TableName.CertificateRequests}
      SET "altNames" = (
        SELECT string_agg(elem->>'value', ',')
        FROM jsonb_array_elements("altNamesJson") AS elem
      )
      WHERE "altNamesJson" IS NOT NULL
    `);

    await knex.schema.alterTable(TableName.CertificateRequests, (t) => {
      t.dropColumn("altNamesJson");
    });

    await knex.schema.alterTable(TableName.CertificateRequests, (t) => {
      t.dropIndex("approvalRequestId");
      t.dropForeign(["approvalRequestId"]);
      t.dropColumn("approvalRequestId");
      t.dropColumn("ttl");
      t.dropColumn("enrollmentType");
      t.dropColumn("organization");
      t.dropColumn("organizationalUnit");
      t.dropColumn("country");
      t.dropColumn("state");
      t.dropColumn("locality");
    });
  }

  const hasBypassCol = await knex.schema.hasColumn(TableName.ApprovalPolicies, "bypassForMachineIdentities");
  if (hasBypassCol) {
    await knex.schema.alterTable(TableName.ApprovalPolicies, (t) => {
      t.dropColumn("bypassForMachineIdentities");
    });
  }

  const hasMachineIdentityIdCol = await knex.schema.hasColumn(TableName.ApprovalRequests, "machineIdentityId");
  if (hasMachineIdentityIdCol) {
    await knex.schema.alterTable(TableName.ApprovalRequests, (t) => {
      t.dropIndex("machineIdentityId");
      t.dropForeign(["machineIdentityId"]);
      t.dropColumn("machineIdentityId");
    });
  }
}
