import { ForbiddenError } from "@casl/ability";
import { Knex } from "knex";

import { ActionProjectType } from "@app/db/schemas";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import {
  ProjectPermissionSecretValidationRuleActions,
  ProjectPermissionSub
} from "@app/ee/services/permission/project-permission";
import { BadRequestError, ForbiddenRequestError, NotFoundError } from "@app/lib/errors";
import { OrgServiceActor } from "@app/lib/types";
import { TProjectEnvDALFactory } from "@app/services/project-env/project-env-dal";

import { TKmsServiceFactory } from "../kms/kms-service";
import { KmsDataKey } from "../kms/kms-types";
import { TSecretFolderDALFactory } from "../secret-folder/secret-folder-dal";
import { expandSecretReferencesFactory } from "../secret-v2-bridge/secret-reference-fns";
import { TSecretV2BridgeDALFactory } from "../secret-v2-bridge/secret-v2-bridge-dal";
import { TSecretVersionV2DALFactory } from "../secret-v2-bridge/secret-version-dal";
import { MAX_PREVENT_DUPLICATE_SECRET_VALUE_VERSIONS } from "./secret-validation-rule-constants";
import { mergeConstraints } from "./secret-validation-rule-constraint-fns";
import { TSecretValidationRuleDALFactory } from "./secret-validation-rule-dal";
import { ConstraintTarget, SecretValidationRuleType } from "./secret-validation-rule-enums";
import {
  checkForOverlappingRules,
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
import { TStaticSecretsRuleConfig } from "./static-secrets";

type TSecretValidationRuleServiceFactoryDep = {
  secretValidationRuleDAL: TSecretValidationRuleDALFactory;
  projectEnvDAL: Pick<TProjectEnvDALFactory, "findOne">;
  folderDAL: Pick<TSecretFolderDALFactory, "findBySecretPath">;
  secretDAL: TSecretV2BridgeDALFactory;
  secretVersionV2BridgeDAL: Pick<TSecretVersionV2DALFactory, "find">;
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
   * Pass `tx` when the caller already holds a transaction, or this checks out a second connection.
   * `${env.key}` references are expanded first, so constraints see the resolved value.
   */
  const validateSecrets = async (
    { projectId, environment, envId, secretPath, secrets }: TValidateSecretsDTO,
    tx?: Knex
  ) => {
    if (!secrets.length) return;

    const rules = await secretValidationRuleDAL.find(
      { projectId, isActive: true, type: SecretValidationRuleType.StaticSecrets },
      { tx }
    );
    if (!rules.length) return;

    const { decryptor } = await $getCipher(projectId);

    const coveringRules = findRulesCoveringScope(rules, { envId, secretPath }).map((rule) => ({
      name: rule.name,
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
        ...(secret.secretId && { previousValues: previousValuesBySecretId[secret.secretId] })
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
