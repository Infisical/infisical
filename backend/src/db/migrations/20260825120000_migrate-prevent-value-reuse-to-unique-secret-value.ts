import { Knex } from "knex";

import { inMemoryKeyStore } from "@app/keystore/memory";
import { initLogger } from "@app/lib/logger";
import { kmsRootConfigDALFactory } from "@app/services/kms/kms-root-config-dal";
import { KmsDataKey } from "@app/services/kms/kms-types";
import { superAdminDALFactory } from "@app/services/super-admin/super-admin-dal";

import { TableName } from "../schemas";
import { getMigrationEnvConfig, getMigrationHsmConfig } from "./utils/env-config";
import { getMigrationEncryptionServices, getMigrationHsmService } from "./utils/services";

const MAX_VERSIONS = 25;
const BATCH_SIZE = 500;

type RawConstraint = {
  type: string;
  appliesTo: string;
  value: unknown;
};

const migrateConstraint = (c: RawConstraint): RawConstraint => {
  if (c.type === "prevent-value-reuse") {
    return {
      type: "unique-secret-value",
      appliesTo: c.appliesTo,
      value: {
        secretVersions: { enabled: true, versions: Math.min(Number(c.value) || 10, MAX_VERSIONS) },
        otherSecrets: { enabled: false }
      }
    };
  }
  if (c.type === "prevent-duplicated-values") {
    return {
      type: "unique-secret-value",
      appliesTo: c.appliesTo,
      value: {
        secretVersions: { enabled: false, versions: 1 },
        otherSecrets: { enabled: true }
      }
    };
  }
  return c;
};

export async function up(knex: Knex): Promise<void> {
  // eslint-disable-next-line no-param-reassign
  knex.replicaNode = () => {
    return knex;
  };

  initLogger();
  const { hsmService } = await getMigrationHsmService({ envConfig: getMigrationHsmConfig() });

  const superAdminDAL = superAdminDALFactory(knex);
  const kmsRootConfigDAL = kmsRootConfigDALFactory(knex);
  const envConfig = await getMigrationEnvConfig(superAdminDAL, hsmService, kmsRootConfigDAL);

  const keyStore = inMemoryKeyStore();
  const { kmsService } = await getMigrationEncryptionServices({ envConfig, keyStore, db: knex });

  const rules = await knex(TableName.SecretValidationRule)
    .join(TableName.Project, `${TableName.Project}.id`, `${TableName.SecretValidationRule}.projectId`)
    .select(
      `${TableName.SecretValidationRule}.id`,
      `${TableName.SecretValidationRule}.projectId`,
      `${TableName.SecretValidationRule}.encryptedInputs`
    );

  const updatedRules: { id: string; encryptedInputs: Buffer }[] = [];

  for (const rule of rules) {
    // eslint-disable-next-line no-await-in-loop
    const { decryptor, encryptor } = await kmsService.createCipherPairWithDataKey({
      type: KmsDataKey.SecretManager,
      projectId: rule.projectId
    });

    const decryptedInputs = JSON.parse(decryptor({ cipherTextBlob: Buffer.from(rule.encryptedInputs) }).toString()) as {
      constraints?: RawConstraint[];
    };

    if (!Array.isArray(decryptedInputs.constraints)) {
      // eslint-disable-next-line no-continue
      continue;
    }

    const hasLegacy = decryptedInputs.constraints.some(
      (c: RawConstraint) => c.type === "prevent-value-reuse" || c.type === "prevent-duplicated-values"
    );
    if (!hasLegacy) {
      // eslint-disable-next-line no-continue
      continue;
    }

    decryptedInputs.constraints = decryptedInputs.constraints.map(migrateConstraint);

    const encryptedInputs = encryptor({
      plainText: Buffer.from(JSON.stringify(decryptedInputs))
    }).cipherTextBlob;

    updatedRules.push({ id: rule.id, encryptedInputs });
  }

  for (let i = 0; i < updatedRules.length; i += BATCH_SIZE) {
    const batch = updatedRules.slice(i, i + BATCH_SIZE);
    // eslint-disable-next-line no-await-in-loop
    await Promise.all(
      batch.map((r) =>
        knex(TableName.SecretValidationRule).where({ id: r.id }).update({ encryptedInputs: r.encryptedInputs })
      )
    );
  }
}

const rollbackConstraint = (c: RawConstraint): RawConstraint => {
  if (c.type !== "unique-secret-value") {
    return c;
  }

  const val = c.value as {
    secretVersions?: { enabled?: boolean; versions?: number };
  };

  return {
    type: "prevent-value-reuse",
    appliesTo: c.appliesTo,
    value: val.secretVersions?.versions ?? 10
  };
};

export async function down(knex: Knex): Promise<void> {
  // eslint-disable-next-line no-param-reassign
  knex.replicaNode = () => {
    return knex;
  };

  initLogger();
  const { hsmService } = await getMigrationHsmService({ envConfig: getMigrationHsmConfig() });

  const superAdminDAL = superAdminDALFactory(knex);
  const kmsRootConfigDAL = kmsRootConfigDALFactory(knex);
  const envConfig = await getMigrationEnvConfig(superAdminDAL, hsmService, kmsRootConfigDAL);

  const keyStore = inMemoryKeyStore();
  const { kmsService } = await getMigrationEncryptionServices({ envConfig, keyStore, db: knex });

  const rules = await knex(TableName.SecretValidationRule)
    .join(TableName.Project, `${TableName.Project}.id`, `${TableName.SecretValidationRule}.projectId`)
    .select(
      `${TableName.SecretValidationRule}.id`,
      `${TableName.SecretValidationRule}.projectId`,
      `${TableName.SecretValidationRule}.encryptedInputs`
    );

  const updatedRules: { id: string; encryptedInputs: Buffer }[] = [];

  for (const rule of rules) {
    // eslint-disable-next-line no-await-in-loop
    const { decryptor, encryptor } = await kmsService.createCipherPairWithDataKey({
      type: KmsDataKey.SecretManager,
      projectId: rule.projectId
    });

    const decryptedInputs = JSON.parse(decryptor({ cipherTextBlob: Buffer.from(rule.encryptedInputs) }).toString()) as {
      constraints?: RawConstraint[];
    };

    if (!Array.isArray(decryptedInputs.constraints)) {
      // eslint-disable-next-line no-continue
      continue;
    }

    const hasUniqueSecretValueConstraint = decryptedInputs.constraints.some(
      (c: RawConstraint) => c.type === "unique-secret-value"
    );
    if (!hasUniqueSecretValueConstraint) {
      // eslint-disable-next-line no-continue
      continue;
    }

    decryptedInputs.constraints = decryptedInputs.constraints.map(rollbackConstraint);

    const encryptedInputs = encryptor({
      plainText: Buffer.from(JSON.stringify(decryptedInputs))
    }).cipherTextBlob;

    updatedRules.push({ id: rule.id, encryptedInputs });
  }

  for (let i = 0; i < updatedRules.length; i += BATCH_SIZE) {
    const batch = updatedRules.slice(i, i + BATCH_SIZE);
    // eslint-disable-next-line no-await-in-loop
    await Promise.all(
      batch.map((r) =>
        knex(TableName.SecretValidationRule).where({ id: r.id }).update({ encryptedInputs: r.encryptedInputs })
      )
    );
  }
}
