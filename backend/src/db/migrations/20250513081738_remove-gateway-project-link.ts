import { Knex } from "knex";

import { inMemoryKeyStore } from "@app/keystore/memory";
import { selectAllTableCols } from "@app/lib/knex";
import { initLogger } from "@app/lib/logger";
import { KmsDataKey } from "@app/services/kms/kms-types";

import { TableName } from "../schemas";
import { getMigrationEnvConfig } from "./utils/env-config";
import { getMigrationEncryptionServices } from "./utils/services";

// Note(daniel): We aren't dropping tables or columns in this migrations so we can easily rollback if needed.
// In the future we need to drop the projectGatewayId on the dynamic secrets table, and drop the project_gateways table entirely.

const BATCH_SIZE = 500;

export async function up(knex: Knex): Promise<void> {
  // eslint-disable-next-line no-param-reassign
  knex.replicaNode = () => {
    return knex;
  };

  if (!(await knex.schema.hasColumn(TableName.DynamicSecret, "gatewayId"))) {
    await knex.schema.alterTable(TableName.DynamicSecret, (table) => {
      table.uuid("gatewayId").nullable();
      table.foreign("gatewayId").references("id").inTable(TableName.Gateway).onDelete("SET NULL");

      table.index("gatewayId");
    });

    const existingDynamicSecretsWithProjectGatewayId = await knex(TableName.DynamicSecret)
      .select(selectAllTableCols(TableName.DynamicSecret))
      .whereNotNull(`${TableName.DynamicSecret}.projectGatewayId`)
      .join(TableName.ProjectGateway, `${TableName.ProjectGateway}.id`, `${TableName.DynamicSecret}.projectGatewayId`)
      .whereNotNull(`${TableName.ProjectGateway}.gatewayId`)
      .select(
        knex.ref("projectId").withSchema(TableName.ProjectGateway).as("projectId"),
        knex.ref("gatewayId").withSchema(TableName.ProjectGateway).as("projectGatewayGatewayId")
      );

    initLogger();
    const envConfig = getMigrationEnvConfig();
    const keyStore = inMemoryKeyStore();
    const { kmsService } = await getMigrationEncryptionServices({ envConfig, keyStore, db: knex });

    const updatedDynamicSecrets = await Promise.all(
      existingDynamicSecretsWithProjectGatewayId.map(async (existingDynamicSecret) => {
        if (!existingDynamicSecret.projectGatewayGatewayId) {
          const result = {
            ...existingDynamicSecret,
            gatewayId: null
          };

          const { projectId, projectGatewayGatewayId, ...rest } = result;
          return rest;
        }

        const { decryptor: secretManagerDecryptor } = await kmsService.createCipherPairWithDataKey({
          type: KmsDataKey.SecretManager,
          projectId: existingDynamicSecret.projectId
        });
        const { encryptor: secretManagerEncryptor } = await kmsService.createCipherPairWithDataKey({
          type: KmsDataKey.SecretManager,
          projectId: existingDynamicSecret.projectId
        });

        let decryptedStoredInput = JSON.parse(
          secretManagerDecryptor({ cipherTextBlob: Buffer.from(existingDynamicSecret.encryptedInput) }).toString()
        ) as object;

        // We're not removing the existing projectGatewayId from the input so we can easily rollback without having to re-encrypt the input
        decryptedStoredInput = {
          ...decryptedStoredInput,
          gatewayId: existingDynamicSecret.projectGatewayGatewayId
        };

        const encryptedInput = secretManagerEncryptor({
          plainText: Buffer.from(JSON.stringify(decryptedStoredInput))
        }).cipherTextBlob;

        const result = {
          ...existingDynamicSecret,
          encryptedInput,
          gatewayId: existingDynamicSecret.projectGatewayGatewayId
        };

        const { projectId, projectGatewayGatewayId, ...rest } = result;
        return rest;
      })
    );

    for (let i = 0; i < updatedDynamicSecrets.length; i += BATCH_SIZE) {
      // eslint-disable-next-line no-await-in-loop
      await knex(TableName.DynamicSecret)
        .insert(updatedDynamicSecrets.slice(i, i + BATCH_SIZE))
        .onConflict("id")
        .merge();
    }
  }
}

export async function down(knex: Knex): Promise<void> {
  // no re-encryption needed as we keep the old projectGatewayId in the input
  if (await knex.schema.hasColumn(TableName.DynamicSecret, "gatewayId")) {
    await knex.schema.alterTable(TableName.DynamicSecret, (table) => {
      table.dropForeign("gatewayId");
      table.dropColumn("gatewayId");
    });
  }
}
