import { ForbiddenError } from "@casl/ability";
import { Knex } from "knex";

import { ActionProjectType } from "@app/db/schemas";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import {
  ProjectPermissionSecretValidationRuleActions,
  ProjectPermissionSub
} from "@app/ee/services/permission/project-permission";
import { PgSqlLock } from "@app/keystore/keystore";
import { BadRequestError, ForbiddenRequestError, NotFoundError } from "@app/lib/errors";
import { OrgServiceActor } from "@app/lib/types";
import { TProjectEnvDALFactory } from "@app/services/project-env/project-env-dal";

import { TKmsServiceFactory } from "../kms/kms-service";
import { KmsDataKey } from "../kms/kms-types";
import { TProjectDALFactory } from "../project/project-dal";
import { TSecretFolderDALFactory } from "../secret-folder/secret-folder-dal";
import { containsSecretReference, expandSecretReferencesFactory } from "../secret-v2-bridge/secret-reference-fns";
import { TSecretV2BridgeDALFactory } from "../secret-v2-bridge/secret-v2-bridge-dal";
import { TSecretVersionV2DALFactory } from "../secret-v2-bridge/secret-version-dal";
import { MAX_PREVENT_DUPLICATE_SECRET_VALUE_VERSIONS } from "./secret-validation-rule-constants";
import { mergeConstraints } from "./secret-validation-rule-constraint-fns";
import { TSecretValidationRuleDALFactory } from "./secret-validation-rule-dal";
import { ConstraintTarget, SecretValidationRuleType } from "./secret-validation-rule-enums";
import {
  checkForOverlappingRules,
  doesRulePathCover,
  enforceSecretValidationRules,
  findRulesCoveringScope,
  getConstraintsByTarget,
  getRuleProviders,
  parseSecretValidationRuleConfig,
  secretValidationRuleName
} from "./secret-validation-rule-fns";
import { assertConstraintsProduceSafePasswords } from "./secret-validation-rule-password-generator";
import { hasAnyConstraint } from "./secret-validation-rule-schemas";
import {
  TConstraints,
  TCreateSecretValidationRuleDTO,
  TDeleteSecretValidationRuleDTO,
  TFindConstraintsForGeneratedSecretDTO,
  TFindSecretValidationRuleByIdDTO,
  TGeneratedPasswordValidation,
  TListSecretValidationRulesDTO,
  TSecretValidationRule,
  TSecretValidationRuleConfig,
  TSecretValidationRuleWithEnv,
  TUpdateSecretValidationRuleDTO,
  TValidateSecretsDTO
} from "./secret-validation-rule-types";
import { TDuplicateSecret, TStaticSecretsRuleConfig } from "./static-secrets";

/** Only static-secret rules can ask for a value no other secret already holds. */
const $wantsCrossSecretUniqueness = (config: TSecretValidationRuleConfig) =>
  Boolean((config as TStaticSecretsRuleConfig).valueConstraints?.reusePrevention?.otherSecrets);

type TSecretValidationRuleServiceFactoryDep = {
  secretValidationRuleDAL: TSecretValidationRuleDALFactory;
  projectEnvDAL: Pick<TProjectEnvDALFactory, "findOne">;
  folderDAL: Pick<TSecretFolderDALFactory, "findBySecretPath" | "findSecretPathByFolderIds">;
  secretDAL: TSecretV2BridgeDALFactory;
  secretVersionV2BridgeDAL: Pick<TSecretVersionV2DALFactory, "find">;
  projectDAL: Pick<TProjectDALFactory, "findById">;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
  kmsService: TKmsServiceFactory;
};

export type TSecretValidationRuleServiceFactory = ReturnType<typeof secretValidationRuleServiceFactory>;

export const secretValidationRuleServiceFactory = ({
  secretValidationRuleDAL,
  projectEnvDAL,
  folderDAL,
  secretDAL,
  secretVersionV2BridgeDAL,
  projectDAL,
  permissionService,
  kmsService
}: TSecretValidationRuleServiceFactoryDep) => {
  const $getPermission = async (projectId: string, actor: OrgServiceActor) => {
    const { permission } = await permissionService.getProjectPermission({
      actor: actor.type,
      actorId: actor.id,
      projectId,
      actorAuthMethod: actor.authMethod,
      actorOrgId: actor.orgId,
      actionProjectType: ActionProjectType.SecretManager
    });
    return permission;
  };

  const $ruleNotFound = (type: SecretValidationRuleType, label: string) =>
    new NotFoundError({
      message: `${secretValidationRuleName(type)} validation rule with ${label} not found`
    });

  /**
   * A rule is addressed by ID alone, so refusing one in an unreachable project would confirm it
   * exists. Reads as missing instead. A member lacking the action still gets a refusal.
   */
  const $getPermissionForRule = async (projectId: string, actor: OrgServiceActor, notFound: Error) => {
    try {
      return await $getPermission(projectId, actor);
    } catch (error) {
      if (error instanceof ForbiddenRequestError || error instanceof NotFoundError) throw notFound;
      throw error;
    }
  };

  const $getCipher = (projectId: string) =>
    kmsService.createCipherPairWithDataKey({ type: KmsDataKey.SecretManager, projectId });

  // Listed rather than spread so `encryptedInputs` can never reach a response.
  const $toRecord = (rule: TSecretValidationRuleWithEnv, config: TSecretValidationRuleConfig) =>
    ({
      id: rule.id,
      name: rule.name,
      description: rule.description,
      projectId: rule.projectId,
      secretPath: rule.secretPath,
      environment: rule.environment,
      isActive: rule.isActive,
      type: rule.type,
      createdAt: rule.createdAt,
      updatedAt: rule.updatedAt,
      ...config
    }) as TSecretValidationRule;

  const $resolveEnvId = async (projectId: string, environmentSlug: string) => {
    const env = await projectEnvDAL.findOne({ projectId, slug: environmentSlug });
    if (!env) {
      throw new NotFoundError({
        message: `Environment '${environmentSlug}' not found in project with ID '${projectId}'`
      });
    }
    return env.id;
  };

  const $assertRuleType = (rule: TSecretValidationRuleWithEnv, type: SecretValidationRuleType) => {
    if (rule.type !== type) {
      throw new BadRequestError({
        message: `Secret validation rule with ID '${rule.id}' is a ${secretValidationRuleName(
          rule.type as SecretValidationRuleType
        )} rule, not a ${secretValidationRuleName(type)} rule`
      });
    }
  };

  const $assertNoOverlap = async ({
    projectId,
    type,
    envId,
    secretPath,
    config,
    excludeRuleId
  }: {
    projectId: string;
    type: SecretValidationRuleType;
    envId: string | null;
    secretPath: string;
    config: TSecretValidationRuleConfig;
    excludeRuleId?: string;
  }) => {
    const existingRules = await secretValidationRuleDAL.find({ projectId, type });
    if (!existingRules.length) return;

    const { decryptor } = await $getCipher(projectId);
    checkForOverlappingRules({
      type,
      envId,
      secretPath,
      config,
      excludeRuleId,
      existingRules: existingRules.map((rule) => ({
        id: rule.id,
        name: rule.name,
        envId: rule.envId,
        secretPath: rule.secretPath,
        type: rule.type,
        config: parseSecretValidationRuleConfig(
          rule.type,
          JSON.parse(decryptor({ cipherTextBlob: rule.encryptedInputs }).toString()) as unknown
        )
      }))
    });
  };

  const $assertConstrainsSomething = (type: SecretValidationRuleType, config: TSecretValidationRuleConfig) => {
    if (!hasAnyConstraint(Object.values(getConstraintsByTarget(type, config)))) {
      throw new BadRequestError({ message: "A secret validation rule must set at least one constraint" });
    }
  };

  // Dry run at save time, so infeasible constraints fail here rather than on the next lease.
  const $assertGeneratorCanSatisfy = (type: SecretValidationRuleType, config: TSecretValidationRuleConfig) => {
    if (type === SecretValidationRuleType.StaticSecrets) return;
    assertConstraintsProduceSafePasswords(
      getConstraintsByTarget(type, config)[ConstraintTarget.GeneratedPassword] ?? {}
    );
  };

  // Cross-secret uniqueness is answered from the blind index, so a project without one cannot enforce it.
  const $assertBlindIndexingAvailable = async (projectId: string, config: TSecretValidationRuleConfig) => {
    if (!$wantsCrossSecretUniqueness(config)) return;

    const project = await projectDAL.findById(projectId);
    if (!project.secretBlindIndexEnabled) {
      throw new BadRequestError({
        message:
          "Enable secret blind indexing on this project before preventing reuse of a value another secret already holds"
      });
    }
  };

  const listSecretValidationRules = async (
    { projectId, type }: TListSecretValidationRulesDTO,
    actor: OrgServiceActor
  ) => {
    const permission = await $getPermission(projectId, actor);
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionSecretValidationRuleActions.Read,
      ProjectPermissionSub.SecretValidationRules
    );

    const rules = await secretValidationRuleDAL.findWithEnv({ projectId, ...(type && { type }) });
    if (!rules.length) return [];

    const { decryptor } = await $getCipher(projectId);
    return rules.map((rule) =>
      $toRecord(
        rule,
        parseSecretValidationRuleConfig(
          rule.type,
          JSON.parse(decryptor({ cipherTextBlob: rule.encryptedInputs }).toString()) as unknown
        )
      )
    );
  };

  const $findRuleOrThrow = async (ruleId: string, type: SecretValidationRuleType, actor: OrgServiceActor) => {
    const notFound = $ruleNotFound(type, `ID '${ruleId}'`);
    const rule = await secretValidationRuleDAL.findOneWithEnv({ id: ruleId });
    if (!rule) throw notFound;

    const permission = await $getPermissionForRule(rule.projectId, actor, notFound);
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionSecretValidationRuleActions.Read,
      ProjectPermissionSub.SecretValidationRules
    );
    $assertRuleType(rule, type);

    const { decryptor } = await $getCipher(rule.projectId);
    const config = parseSecretValidationRuleConfig(
      rule.type,
      JSON.parse(decryptor({ cipherTextBlob: rule.encryptedInputs }).toString()) as unknown
    );

    return { rule, config };
  };

  const findSecretValidationRuleById = async (
    { ruleId, type }: TFindSecretValidationRuleByIdDTO,
    actor: OrgServiceActor
  ) => {
    const { rule, config } = await $findRuleOrThrow(ruleId, type, actor);
    return $toRecord(rule, config);
  };

  const createSecretValidationRule = async (
    {
      type,
      name,
      projectId,
      description,
      environment,
      secretPath,
      isActive,
      ...configInput
    }: TCreateSecretValidationRuleDTO,
    actor: OrgServiceActor
  ) => {
    const permission = await $getPermission(projectId, actor);
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionSecretValidationRuleActions.Create,
      ProjectPermissionSub.SecretValidationRules
    );

    const envId = environment ? await $resolveEnvId(projectId, environment) : null;
    const config = parseSecretValidationRuleConfig(type, configInput);

    $assertConstrainsSomething(type, config);
    $assertGeneratorCanSatisfy(type, config);
    await $assertBlindIndexingAvailable(projectId, config);
    await $assertNoOverlap({ projectId, type, envId, secretPath, config });

    const { encryptor } = await $getCipher(projectId);
    const { cipherTextBlob: encryptedInputs } = encryptor({ plainText: Buffer.from(JSON.stringify(config)) });

    const rule = await secretValidationRuleDAL.createWithEnv({
      name,
      description,
      projectId,
      envId,
      secretPath,
      type,
      isActive,
      encryptedInputs
    });
    return $toRecord(rule, config);
  };

  const updateSecretValidationRule = async (
    {
      ruleId,
      type,
      name,
      description,
      environment,
      secretPath,
      isActive,
      ...configPatch
    }: TUpdateSecretValidationRuleDTO,
    actor: OrgServiceActor
  ) => {
    const notFound = $ruleNotFound(type, `ID '${ruleId}'`);
    const existingRule = await secretValidationRuleDAL.findOneWithEnv({ id: ruleId });
    if (!existingRule) throw notFound;

    const { projectId } = existingRule;
    const permission = await $getPermissionForRule(existingRule.projectId, actor, notFound);
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionSecretValidationRuleActions.Edit,
      ProjectPermissionSub.SecretValidationRules
    );
    $assertRuleType(existingRule, type);

    let envId = existingRule.envId ?? null;
    if (environment !== undefined) envId = environment ? await $resolveEnvId(projectId, environment) : null;

    const { encryptor, decryptor } = await $getCipher(projectId);
    const storedConfig = JSON.parse(decryptor({ cipherTextBlob: existingRule.encryptedInputs }).toString()) as Record<
      string,
      unknown
    >;

    // Each constraint target is replaced when supplied, cleared when null, and left alone otherwise.
    const mergedConfig = { ...storedConfig };
    Object.entries(configPatch).forEach(([field, value]) => {
      if (value === undefined) return;
      if (value === null) delete mergedConfig[field];
      else mergedConfig[field] = value;
    });

    const config = parseSecretValidationRuleConfig(type, mergedConfig);
    const finalSecretPath = secretPath ?? existingRule.secretPath;

    $assertConstrainsSomething(type, config);
    $assertGeneratorCanSatisfy(type, config);
    await $assertBlindIndexingAvailable(projectId, config);
    await $assertNoOverlap({ projectId, type, envId, secretPath: finalSecretPath, config, excludeRuleId: ruleId });

    const rule = await secretValidationRuleDAL.updateByIdWithEnv(ruleId, {
      ...(name !== undefined && { name }),
      ...(description !== undefined && { description }),
      ...(environment !== undefined && { envId }),
      ...(secretPath !== undefined && { secretPath }),
      ...(isActive !== undefined && { isActive }),
      encryptedInputs: encryptor({ plainText: Buffer.from(JSON.stringify(config)) }).cipherTextBlob
    });
    return $toRecord(rule, config);
  };

  const deleteSecretValidationRule = async (
    { ruleId, type }: TDeleteSecretValidationRuleDTO,
    actor: OrgServiceActor
  ) => {
    const notFound = $ruleNotFound(type, `ID '${ruleId}'`);
    const rule = await secretValidationRuleDAL.findOneWithEnv({ id: ruleId });
    if (!rule) throw notFound;

    const permission = await $getPermissionForRule(rule.projectId, actor, notFound);
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionSecretValidationRuleActions.Delete,
      ProjectPermissionSub.SecretValidationRules
    );
    $assertRuleType(rule, type);

    const { decryptor } = await $getCipher(rule.projectId);
    const config = parseSecretValidationRuleConfig(
      rule.type,
      JSON.parse(decryptor({ cipherTextBlob: rule.encryptedInputs }).toString()) as unknown
    );

    await secretValidationRuleDAL.deleteById(ruleId);
    return $toRecord(rule, config);
  };

  /**
   * The secret already holding each incoming value, keyed by the incoming key, for the secrets that
   * collide with one. Values are matched through the project's blind index rather than by reading
   * every secret in the project back out.
   *
   * The index is built over the value as stored, so a value carrying a `${...}` reference is skipped:
   * its stored form would never line up with the resolved one anyway.
   */
  const $findDuplicatesInScope = async (
    {
      projectId,
      environment,
      secretPath,
      secrets,
      scope,
      canAccessLocation,
      generateSecretBlindIndex
    }: Pick<TValidateSecretsDTO, "projectId" | "environment" | "secretPath" | "secrets" | "canAccessLocation"> & {
      scope: { envId?: string | null; secretPath: string };
      generateSecretBlindIndex: (value: Buffer) => Promise<string>;
    },
    tx?: Knex
  ): Promise<Record<string, TDuplicateSecret>> => {
    const candidates = secrets.filter(
      (secret): secret is typeof secret & { value: string } =>
        secret.value !== undefined && !containsSecretReference(secret.value)
    );
    if (!candidates.length) return {};

    // Two writes of the same value would each find no duplicate and both land. The lock makes this
    // check and the write that follows it atomic, so the second one sees the first.
    if (tx) await tx.raw("SELECT pg_advisory_xact_lock(?)", [PgSqlLock.SecretValueUniqueCheck(projectId)]);

    const blindIndexes = await Promise.all(
      candidates.map((secret) => generateSecretBlindIndex(Buffer.from(secret.value)))
    );

    const duplicates: Record<string, TDuplicateSecret> = {};

    // Two secrets in one request can collide with each other before either exists in the database.
    const seenInBatch = new Map<string, TDuplicateSecret>();
    candidates.forEach((secret, idx) => {
      const seen = seenInBatch.get(blindIndexes[idx]);
      if (seen) duplicates[secret.key] = seen;
      else seenInBatch.set(blindIndexes[idx], { key: secret.key, environment, secretPath });
    });

    const excludedSecretIds = candidates.map((secret) => secret.secretId).filter(Boolean) as string[];
    const existing = await secretDAL.findExistingSecretsByBlindIndexes(
      projectId,
      [...new Set(blindIndexes)],
      excludedSecretIds.length ? excludedSecretIds : undefined,
      scope.envId ?? undefined,
      tx
    );
    if (!existing.length) return duplicates;

    const folderIds = [...new Set(existing.map((secret) => secret.folderId))];
    const folderPaths = await folderDAL.findSecretPathByFolderIds(projectId, folderIds, tx);
    const pathByFolderId = new Map(folderIds.map((id, idx) => [id, folderPaths[idx]?.path ?? "/"]));

    const accessByLocation = new Map<string, boolean>();
    const isHidden = (dupEnvironment: string, dupPath: string) => {
      if (!canAccessLocation) return false;

      const location = `${dupEnvironment}:${dupPath}`;
      let hidden = accessByLocation.get(location);
      if (hidden === undefined) {
        hidden = !canAccessLocation(dupEnvironment, dupPath);
        accessByLocation.set(location, hidden);
      }
      return hidden;
    };

    // The lookup spans the project, so drop the hits the rule's own path does not reach.
    const inScope = new Map<string, TDuplicateSecret>();
    existing.forEach((secret) => {
      if (!secret.secretValueBlindIndex || inScope.has(secret.secretValueBlindIndex)) return;

      const dupPath = pathByFolderId.get(secret.folderId) ?? "/";
      if (!doesRulePathCover(scope.secretPath, dupPath)) return;

      inScope.set(secret.secretValueBlindIndex, {
        key: secret.key,
        environment: secret.environment,
        secretPath: dupPath,
        hidden: isHidden(secret.environment, dupPath)
      });
    });

    candidates.forEach((secret, idx) => {
      if (duplicates[secret.key]) return;

      const duplicate = inScope.get(blindIndexes[idx]);
      if (duplicate) duplicates[secret.key] = duplicate;
    });

    return duplicates;
  };

  /**
   * Pass `tx` when the caller already holds a transaction, or this checks out a second connection.
   * `${env.key}` references are expanded first, so constraints see the resolved value.
   */
  const validateSecrets = async (
    { projectId, environment, envId, secretPath, secrets, canAccessLocation }: TValidateSecretsDTO,
    tx?: Knex
  ) => {
    if (!secrets.length) return;

    const rules = await secretValidationRuleDAL.find(
      { projectId, isActive: true, type: SecretValidationRuleType.StaticSecrets },
      { tx }
    );
    if (!rules.length) return;

    const { decryptor, generateSecretBlindIndex } = await $getCipher(projectId);

    const coveringRules = findRulesCoveringScope(rules, { envId, secretPath }).map((rule) => ({
      name: rule.name,
      scope: { envId: rule.envId, secretPath: rule.secretPath },
      config: parseSecretValidationRuleConfig(
        rule.type,
        JSON.parse(decryptor({ cipherTextBlob: rule.encryptedInputs }).toString()) as unknown
      ) as TStaticSecretsRuleConfig
    }));
    if (!coveringRules.length) return;

    // reading version history is only worth it when a covering rule actually forbids reuse
    const versionsToCheck = Math.max(
      0,
      ...coveringRules.map((rule) => rule.config.valueConstraints?.reusePrevention?.previousVersions ?? 0)
    );

    const previousValuesBySecretId: Record<string, string[]> = {};
    if (versionsToCheck > 0) {
      const secretIds = secrets.map((secret) => secret.secretId).filter(Boolean) as string[];
      const versionsPerSecret = await Promise.all(
        secretIds.map((secretId) =>
          secretVersionV2BridgeDAL.find(
            { secretId },
            { sort: [["version", "desc"]], limit: MAX_PREVENT_DUPLICATE_SECRET_VALUE_VERSIONS, tx }
          )
        )
      );

      versionsPerSecret.flat().forEach((version) => {
        if (!version.encryptedValue) return;
        previousValuesBySecretId[version.secretId] ??= [];
        previousValuesBySecretId[version.secretId].push(
          decryptor({ cipherTextBlob: version.encryptedValue }).toString()
        );
      });
    }

    // Only one covering rule can ask for cross-secret uniqueness; overlap is rejected at save time.
    const uniquenessRule = coveringRules.find((rule) => $wantsCrossSecretUniqueness(rule.config));
    const duplicates = uniquenessRule
      ? await $findDuplicatesInScope(
          {
            projectId,
            environment,
            secretPath,
            secrets,
            scope: uniquenessRule.scope,
            canAccessLocation,
            generateSecretBlindIndex
          },
          tx
        )
      : {};

    const { expandSecretReferences } = expandSecretReferencesFactory({
      projectId,
      folderDAL,
      secretDAL,
      decryptSecretValue: (value) => (value ? decryptor({ cipherTextBlob: value }).toString() : undefined),
      canExpandValue: () => true
    });

    const resolvedSecrets = await Promise.all(
      secrets.map(async (secret) => ({
        key: secret.key,
        value: await expandSecretReferences({
          value: secret.value,
          secretPath,
          environment,
          secretKey: secret.key
        }),
        ...(secret.secretId && { previousValues: previousValuesBySecretId[secret.secretId] }),
        ...(duplicates[secret.key] && { duplicateOf: duplicates[secret.key] })
      }))
    );

    enforceSecretValidationRules({ rules: coveringRules, secrets: resolvedSecrets });
  };

  /**
   * The constraints a dynamic secret lease or a secret rotation has to generate within. Rules that
   * cover the same credential contribute together, and overlap is rejected when a rule is saved, so
   * the merged set can never contradict itself.
   */
  const findConstraintsForGeneratedSecret = async ({
    projectId,
    envId,
    secretPath,
    type,
    provider
  }: TFindConstraintsForGeneratedSecretDTO): Promise<TGeneratedPasswordValidation> => {
    const rules = await secretValidationRuleDAL.find({ projectId, isActive: true, type });
    if (!rules.length) return { constraints: {}, ruleNames: [] };

    const { decryptor } = await $getCipher(projectId);

    const constraintSets: TConstraints[] = [];
    const ruleNames: string[] = [];

    findRulesCoveringScope(rules, { envId, secretPath }).forEach((rule) => {
      const config = parseSecretValidationRuleConfig(
        rule.type,
        JSON.parse(decryptor({ cipherTextBlob: rule.encryptedInputs }).toString()) as unknown
      );

      if (!getRuleProviders(type, config)?.includes(provider)) return;

      const passwordConstraints = getConstraintsByTarget(type, config)[ConstraintTarget.GeneratedPassword];
      if (passwordConstraints) constraintSets.push(passwordConstraints);
      ruleNames.push(rule.name);
    });

    return { constraints: mergeConstraints(constraintSets), ruleNames };
  };

  return {
    listSecretValidationRules,
    findSecretValidationRuleById,
    createSecretValidationRule,
    updateSecretValidationRule,
    deleteSecretValidationRule,
    validateSecrets,
    findConstraintsForGeneratedSecret
  };
};
