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

const ACTIVE_RULE_INDEX = "secret_validation_rules_projectid_isactive_index";

type TLegacyConstraint = { type: string; appliesTo: string; value: string };
type TLegacyConfig = { constraints?: TLegacyConstraint[]; providers?: string[] };

type TNamedConstraints = {
  minLength?: number;
  maxLength?: number;
  regexPattern?: string;
  requiredPrefix?: string;
  requiredSuffix?: string;
  reusePrevention?: { previousVersions?: number };
};

type TNamedConfig = {
  keyConstraints?: TNamedConstraints;
  valueConstraints?: TNamedConstraints;
  passwordConstraints?: TNamedConstraints;
  providers?: string[];
};

type TConstraintField = "keyConstraints" | "valueConstraints" | "passwordConstraints";

const TARGET_TO_FIELD: Record<string, TConstraintField> = {
  key: "keyConstraints",
  value: "valueConstraints",
  password: "passwordConstraints"
};

// Reuse prevention is grouped under its own object, so the field is addressed by path.
const KIND_TO_PATH: Record<string, string[]> = {
  "min-length": ["minLength"],
  "max-length": ["maxLength"],
  "regex-pattern": ["regexPattern"],
  "required-prefix": ["requiredPrefix"],
  "required-suffix": ["requiredSuffix"],
  "prevent-value-reuse": ["reusePrevention", "previousVersions"]
};

const PATH_TO_KIND: Record<string, string> = Object.fromEntries(
  Object.entries(KIND_TO_PATH).map(([kind, path]) => [path.join("."), kind])
);

const NUMERIC_KINDS = new Set(["min-length", "max-length", "prevent-value-reuse"]);

// the old shape allowed the same check twice on one target, which nothing rejected and both halves of which were enforced.
// keep the stricter of the two so the rule carries over meaning what it did.

const strictest = (field: keyof TNamedConstraints, existing: number, incoming: number) =>
  field === "maxLength" ? Math.min(existing, incoming) : Math.max(existing, incoming);

// a non-numeric length rendered as NaN at enforcement time, so it constrained nothing.
const toFieldValue = (kind: string, raw: string): string | number | null => {
  if (!NUMERIC_KINDS.has(kind)) return raw;
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed >= 1 ? parsed : null;
};

// walk to the object holding the leaf, creating the groups on the way.
const resolveHolder = (bucket: Record<string, unknown>, path: string[]) => {
  let holder = bucket;
  for (const group of path.slice(0, -1)) {
    if (!holder[group]) holder[group] = {};
    holder = holder[group] as Record<string, unknown>;
  }
  return holder as Record<string, string | number>;
};

const toNamedConfig = (legacy: TLegacyConfig, ruleId: string): TNamedConfig => {
  const config: TNamedConfig = {};
  if (legacy.providers) config.providers = legacy.providers;

  for (const constraint of legacy.constraints ?? []) {
    const target = TARGET_TO_FIELD[constraint.appliesTo];
    const path = KIND_TO_PATH[constraint.type];
    const value = target && path ? toFieldValue(constraint.type, constraint.value) : null;

    if (value === null) {
      logger.warn(
        `Dropping secret validation constraint with no equivalent [ruleId=${ruleId}] [type=${constraint.type}] [appliesTo=${constraint.appliesTo}] [value=${constraint.value}]`
      );
      // eslint-disable-next-line no-continue
      continue;
    }

    const bucket = (config[target] ?? {}) as Record<string, unknown>;
    const holder = resolveHolder(bucket, path);
    const leaf = path[path.length - 1];
    const existing = holder[leaf];

    if (existing === undefined) {
      holder[leaf] = value;
    } else if (typeof existing === "number" && typeof value === "number") {
      holder[leaf] = strictest(leaf as keyof TNamedConstraints, existing, value);
      logger.warn(`Collapsed duplicate secret validation constraint [ruleId=${ruleId}] [type=${constraint.type}]`);
    } else {
      logger.warn(`Discarding duplicate secret validation constraint [ruleId=${ruleId}] [type=${constraint.type}]`);
    }

    config[target] = bucket as TNamedConstraints;
  }

  return config;
};

const toLegacyConfig = (named: TNamedConfig): TLegacyConfig => {
  const constraints: TLegacyConstraint[] = [];

  const collect = (target: string, prefix: string[], holder: Record<string, unknown>) => {
    Object.entries(holder).forEach(([field, value]) => {
      if (value === undefined || value === null) return;
      const path = [...prefix, field];
      if (typeof value === "object") {
        collect(target, path, value as Record<string, unknown>);
        return;
      }
      constraints.push({ type: PATH_TO_KIND[path.join(".")], appliesTo: target, value: String(value) });
    });
  };

  Object.entries(TARGET_TO_FIELD).forEach(([target, field]) => {
    const bucket = named[field];
    if (bucket) collect(target, [], bucket as Record<string, unknown>);
  });

  return { ...(named.providers && { providers: named.providers }), constraints };
};

const rewriteConfigs = async (knex: Knex, convert: (config: never, ruleId: string) => unknown) => {
  const rules = await knex(TableName.SecretValidationRule).select("id", "projectId", "encryptedInputs");
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

    let config: unknown;
    try {
      config = JSON.parse(projectKms.decryptor({ cipherTextBlob: rule.encryptedInputs }).toString());
    } catch (err) {
      logger.error(err, `Migration failed to decrypt secret validation rule [ruleId=${rule.id}]`);
      throw err;
    }

    const { cipherTextBlob } = projectKms.encryptor({
      plainText: Buffer.from(JSON.stringify(convert(config as never, rule.id)))
    });
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
  await rewriteConfigs(knex, toNamedConfig);

  await knex.schema.alterTable(TableName.SecretValidationRule, (tb) => {
    // Every secret write reads the project's active rules, and projectId alone does not narrow that.
    tb.index(["projectId", "isActive"], ACTIVE_RULE_INDEX);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable(TableName.SecretValidationRule, (tb) => {
    tb.dropIndex(["projectId", "isActive"], ACTIVE_RULE_INDEX);
  });

  await rewriteConfigs(knex, toLegacyConfig);
}
