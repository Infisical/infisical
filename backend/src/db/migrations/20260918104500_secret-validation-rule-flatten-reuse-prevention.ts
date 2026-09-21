import { Knex } from "knex";

import { inMemoryKeyStore } from "@app/keystore/memory";
import { initLogger, logger } from "@app/lib/logger";
import { kmsRootConfigDALFactory } from "@app/services/kms/kms-root-config-dal";
import { KmsDataKey } from "@app/services/kms/kms-types";
import { superAdminDALFactory } from "@app/services/super-admin/super-admin-dal";

import { TableName } from "../schemas";
import { getMigrationEnvConfig, getMigrationHsmConfig } from "./utils/env-config";
import { createCircularCache } from "./utils/ring-buffer";
import { getMigrationEncryptionServices, getMigrationHsmService } from "./utils/services";

const BATCH_SIZE = 500;

// Only a static-secrets rule carries valueConstraints, so the other types need no decryption at all.
const STATIC_SECRETS_TYPE = "static-secrets";

type TReusePrevention = { previousVersions?: number; otherSecretsInScope?: boolean };

type TValueConstraints = {
  reusePrevention?: TReusePrevention;
  uniqueAcrossLastVersions?: number;
  uniqueWithinScope?: boolean;
};

type TRuleConfig = { valueConstraints?: TValueConstraints };

const flattenReusePrevention = (config: TRuleConfig): TRuleConfig => {
  if (!config.valueConstraints?.reusePrevention) return config;

  const { reusePrevention, ...constraints } = config.valueConstraints;
  const { previousVersions, otherSecretsInScope } = reusePrevention;

  return {
    ...config,
    valueConstraints: {
      ...constraints,
      ...(previousVersions !== undefined && { uniqueAcrossLastVersions: previousVersions }),
      ...(otherSecretsInScope !== undefined && { uniqueWithinScope: otherSecretsInScope })
    }
  };
};

const nestReusePrevention = (config: TRuleConfig): TRuleConfig => {
  if (!config.valueConstraints) return config;

  const { uniqueAcrossLastVersions, uniqueWithinScope, ...constraints } = config.valueConstraints;
  if (uniqueAcrossLastVersions === undefined && uniqueWithinScope === undefined) return config;

  return {
    ...config,
    valueConstraints: {
      ...constraints,
      reusePrevention: {
        ...(uniqueAcrossLastVersions !== undefined && { previousVersions: uniqueAcrossLastVersions }),
        ...(uniqueWithinScope !== undefined && { otherSecretsInScope: uniqueWithinScope })
      }
    }
  };
};

const rewriteConfigs = async (knex: Knex, convert: (config: TRuleConfig) => TRuleConfig) => {
  const rules = await knex(TableName.SecretValidationRule)
    .where("type", STATIC_SECRETS_TYPE)
    .select("id", "projectId", "encryptedInputs");
  if (!rules.length) return;

  initLogger();

  const { hsmService } = await getMigrationHsmService({ envConfig: getMigrationHsmConfig() });
  const superAdminDAL = superAdminDALFactory(knex);
  const kmsRootConfigDAL = kmsRootConfigDALFactory(knex);
  const envConfig = await getMigrationEnvConfig(superAdminDAL, hsmService, kmsRootConfigDAL);
  const keyStore = inMemoryKeyStore();
  const { kmsService } = await getMigrationEncryptionServices({ envConfig, keyStore, db: knex });
  const projectKmsCache =
    createCircularCache<Awaited<ReturnType<(typeof kmsService)["createCipherPairWithDataKey"]>>>(25);

  const updates: { id: string; encryptedInputs: Buffer }[] = [];

  for (const rule of rules) {
    let projectKms = projectKmsCache.getItem(rule.projectId);
    if (!projectKms) {
      // eslint-disable-next-line no-await-in-loop
      projectKms = await kmsService.createCipherPairWithDataKey(
        { type: KmsDataKey.SecretManager, projectId: rule.projectId },
        knex
      );
      projectKmsCache.push(rule.projectId, projectKms);
    }

    let config: TRuleConfig;
    try {
      config = JSON.parse(projectKms.decryptor({ cipherTextBlob: rule.encryptedInputs }).toString()) as TRuleConfig;
    } catch (err) {
      // A rule we cannot read is a rule that would silently stop being enforced once the field is renamed.
      logger.error(err, `Migration failed to decrypt secret validation rule [ruleId=${rule.id}]`);
      throw err;
    }

    const converted = convert(config);
    // eslint-disable-next-line no-continue
    if (converted === config) continue;

    const { cipherTextBlob } = projectKms.encryptor({ plainText: Buffer.from(JSON.stringify(converted)) });
    updates.push({ id: rule.id, encryptedInputs: cipherTextBlob });
  }

  await knex.transaction(async (trx) => {
    for (let i = 0; i < updates.length; i += BATCH_SIZE) {
      // eslint-disable-next-line no-await-in-loop
      await Promise.all(
        updates
          .slice(i, i + BATCH_SIZE)
          .map((update) =>
            trx(TableName.SecretValidationRule)
              .where({ id: update.id })
              .update({ encryptedInputs: update.encryptedInputs })
          )
      );
    }
  });
};

export async function up(knex: Knex): Promise<void> {
  await rewriteConfigs(knex, flattenReusePrevention);
}

export async function down(knex: Knex): Promise<void> {
  await rewriteConfigs(knex, nestReusePrevention);
}
