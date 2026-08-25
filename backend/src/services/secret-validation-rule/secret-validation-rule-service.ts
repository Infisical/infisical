import { ForbiddenError } from "@casl/ability";
import { Knex } from "knex";
import picomatch from "picomatch";

import { ActionProjectType, TSecretValidationRules } from "@app/db/schemas";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import { ProjectPermissionActions, ProjectPermissionSub } from "@app/ee/services/permission/project-permission";
import { PgSqlLock } from "@app/keystore/keystore";
import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { TProjectEnvDALFactory } from "@app/services/project-env/project-env-dal";

import { TKmsServiceFactory } from "../kms/kms-service";
import { KmsDataKey } from "../kms/kms-types";
import { TProjectDALFactory } from "../project/project-dal";
import { TSecretFolderDALFactory } from "../secret-folder/secret-folder-dal";
import { containsSecretReference, expandSecretReferencesFactory } from "../secret-v2-bridge/secret-reference-fns";
import { TSecretV2BridgeDALFactory } from "../secret-v2-bridge/secret-v2-bridge-dal";
import { TSecretVersionV2DALFactory } from "../secret-v2-bridge/secret-version-dal";
import { TSecretValidationRuleDALFactory } from "./secret-validation-rule-dal";
import { checkForOverlappingRules, enforceSecretValidationRules } from "./secret-validation-rule-fns";
import { assertConstraintsProduceSafePasswords } from "./secret-validation-rule-password-generator";
import { MAX_PREVENT_VALUE_REUSE_VERSIONS, parseSecretValidationRuleInputs } from "./secret-validation-rule-schemas";
import {
  ConstraintType,
  DynamicSecretRuleProvider,
  SecretRotationRuleProvider,
  SecretValidationRuleType,
  TConstraint,
  TCreateSecretValidationRuleDTO,
  TDeleteSecretValidationRuleDTO,
  TDynamicSecretsInputs,
  TListSecretValidationRulesDTO,
  TSecretRotationsInputs,
  TSecretValidationRuleInputs,
  TSecretValidationRuleRecord,
  TUpdateSecretValidationRuleDTO
} from "./secret-validation-rule-types";

const $requiresBlindIndex = (inputs: TSecretValidationRuleInputs): boolean =>
  Boolean(inputs.constraints?.some((c) => c.type === ConstraintType.UniqueSecretValue && c.value.otherSecrets.enabled));

// Builds the API-facing rule record: the selected row fields plus the rule's
// type-specific fields flattened alongside `type`. Selecting explicitly keeps
// `encryptedInputs` (and any column added later) out of responses rather than
// relying on the response schema to strip it.
const $toRuleRecord = (rule: TSecretValidationRules, inputs: TSecretValidationRuleInputs) =>
  ({
    id: rule.id,
    name: rule.name,
    description: rule.description,
    projectId: rule.projectId,
    envId: rule.envId,
    secretPath: rule.secretPath,
    isActive: rule.isActive,
    createdAt: rule.createdAt,
    updatedAt: rule.updatedAt,
    type: rule.type,
    ...inputs
  }) as TSecretValidationRuleRecord;

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
  const listByProjectId = async ({
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId,
    projectId
  }: TListSecretValidationRulesDTO) => {
    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.SecretManager
    });
    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Read, ProjectPermissionSub.Settings);

    const rules = await secretValidationRuleDAL.find({ projectId });

    const { decryptor: ruleInputsDecryptor } = await kmsService.createCipherPairWithDataKey({
      type: KmsDataKey.SecretManager,
      projectId
    });

    const finalRules = (rules || []).map((rule) =>
      $toRuleRecord(
        rule,
        parseSecretValidationRuleInputs(
          rule.type,
          JSON.parse(ruleInputsDecryptor({ cipherTextBlob: rule.encryptedInputs }).toString()) as unknown
        )
      )
    );

    return finalRules;
  };

  const createRule = async ({
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId,
    projectId,
    name,
    description,
    environmentSlug,
    secretPath,
    rule: { type, ...inputs }
  }: TCreateSecretValidationRuleDTO) => {
    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.SecretManager
    });
    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Edit, ProjectPermissionSub.Settings);

    let envId: string | null = null;
    if (environmentSlug) {
      const env = await projectEnvDAL.findOne({ projectId, slug: environmentSlug });
      if (!env) {
        throw new NotFoundError({ message: `Environment with slug '${environmentSlug}' not found in project` });
      }
      envId = env.id;
    }

    const parsedInputs = parseSecretValidationRuleInputs(type, inputs);

    if ($requiresBlindIndex(parsedInputs)) {
      const project = await projectDAL.findById(projectId);
      if (!project.secretBlindIndexEnabled) {
        throw new BadRequestError({
          message:
            "Blind indexing must be enabled for this project before enabling the 'other secrets in scope' uniqueness check. Enable it under Project Settings or the Insights page."
        });
      }
    }

    // For generated-credential rules, do a dry run before storing the rule so
    // infeasible constraints (impossible length window, bad regex, etc.) fail
    // at save time rather than silently breaking lease/rotation creation later.
    if (type === SecretValidationRuleType.DynamicSecrets || type === SecretValidationRuleType.SecretRotations) {
      assertConstraintsProduceSafePasswords(
        (parsedInputs as TDynamicSecretsInputs | TSecretRotationsInputs).constraints
      );
    }

    const { encryptor: ruleInputsEncryptor, decryptor: ruleInputsDecryptor } =
      await kmsService.createCipherPairWithDataKey({
        type: KmsDataKey.SecretManager,
        projectId
      });

    const existingRules = await secretValidationRuleDAL.find({ projectId });
    checkForOverlappingRules({
      ruleType: type,
      envId,
      secretPath,
      inputs: parsedInputs,
      existingRules: existingRules.map((r) => ({
        id: r.id,
        name: r.name,
        envId: r.envId,
        secretPath: r.secretPath,
        type: r.type,
        inputs: parseSecretValidationRuleInputs(
          r.type,
          JSON.parse(ruleInputsDecryptor({ cipherTextBlob: r.encryptedInputs }).toString()) as unknown
        )
      }))
    });

    const { cipherTextBlob: encryptedRuleInputs } = ruleInputsEncryptor({
      plainText: Buffer.from(JSON.stringify(parsedInputs))
    });

    const rule = await secretValidationRuleDAL.create({
      name,
      description,
      projectId,
      envId,
      secretPath,
      type,
      encryptedInputs: encryptedRuleInputs
    });

    return $toRuleRecord(rule, parsedInputs);
  };

  const updateRule = async ({
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId,
    projectId,
    ruleId,
    environmentSlug,
    rule,
    ...dto
  }: TUpdateSecretValidationRuleDTO) => {
    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.SecretManager
    });
    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Edit, ProjectPermissionSub.Settings);

    const existingRule = await secretValidationRuleDAL.findOne({ id: ruleId, projectId });
    if (!existingRule) {
      throw new NotFoundError({ message: `Secret validation rule with ID ${ruleId} not found` });
    }

    let envId: string | null | undefined;
    if (environmentSlug !== undefined) {
      if (environmentSlug) {
        const env = await projectEnvDAL.findOne({ projectId, slug: environmentSlug });
        if (!env) {
          throw new NotFoundError({ message: `Environment with slug '${environmentSlug}' not found in project` });
        }
        envId = env.id;
      } else {
        envId = null;
      }
    }

    const { encryptor: ruleInputsEncryptor, decryptor: ruleInputsDecryptor } =
      await kmsService.createCipherPairWithDataKey({
        type: KmsDataKey.SecretManager,
        projectId
      });

    // An update either replaces the whole config or leaves the stored one
    // untouched. `type` has its own column and the per-type input schemas strip
    // it, so the incoming config can go straight in — only the per-type input
    // fields reach the blob.
    const ruleType = rule?.type ?? existingRule.type;
    const parsedInputs = parseSecretValidationRuleInputs(
      ruleType,
      rule ?? (JSON.parse(ruleInputsDecryptor({ cipherTextBlob: existingRule.encryptedInputs }).toString()) as unknown)
    );

    if ($requiresBlindIndex(parsedInputs)) {
      const project = await projectDAL.findById(projectId);
      if (!project.secretBlindIndexEnabled) {
        throw new BadRequestError({
          message:
            "Blind indexing must be enabled for this project before enabling the 'other secrets in scope' uniqueness check. Enable it under Project Settings or the Insights page."
        });
      }
    }

    if (ruleType === SecretValidationRuleType.DynamicSecrets || ruleType === SecretValidationRuleType.SecretRotations) {
      assertConstraintsProduceSafePasswords(
        (parsedInputs as TDynamicSecretsInputs | TSecretRotationsInputs).constraints
      );
    }

    const finalEnvId = envId !== undefined ? envId : (existingRule.envId as string | null);
    const finalSecretPath = dto.secretPath ?? existingRule.secretPath;

    const existingRules = await secretValidationRuleDAL.find({ projectId });
    checkForOverlappingRules({
      ruleType: ruleType as SecretValidationRuleType,
      envId: finalEnvId,
      secretPath: finalSecretPath,
      inputs: parsedInputs,
      existingRules: existingRules.map((r) => ({
        id: r.id,
        name: r.name,
        envId: r.envId,
        secretPath: r.secretPath,
        type: r.type,
        inputs: parseSecretValidationRuleInputs(
          r.type,
          JSON.parse(ruleInputsDecryptor({ cipherTextBlob: r.encryptedInputs }).toString()) as unknown
        )
      })),
      excludeRuleId: ruleId
    });

    // The rule config moves as a unit: `type` and the re-encrypted inputs are
    // written together, or neither is.
    const encryptedInputs = rule
      ? ruleInputsEncryptor({ plainText: Buffer.from(JSON.stringify(parsedInputs)) }).cipherTextBlob
      : undefined;

    const updatedRule = await secretValidationRuleDAL.updateById(ruleId, {
      ...dto,
      ...(envId !== undefined && { envId }),
      ...(rule && { type: rule.type, encryptedInputs })
    });

    return $toRuleRecord(updatedRule, parsedInputs);
  };

  const deleteRule = async ({
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId,
    projectId,
    ruleId
  }: TDeleteSecretValidationRuleDTO) => {
    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.SecretManager
    });
    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Edit, ProjectPermissionSub.Settings);

    const existingRule = await secretValidationRuleDAL.findOne({ id: ruleId, projectId });
    if (!existingRule) {
      throw new NotFoundError({ message: `Secret validation rule with ID ${ruleId} not found` });
    }

    const { decryptor: ruleInputsDecryptor } = await kmsService.createCipherPairWithDataKey({
      type: KmsDataKey.SecretManager,
      projectId
    });

    await secretValidationRuleDAL.deleteById(ruleId);
    return $toRuleRecord(
      existingRule,
      parseSecretValidationRuleInputs(
        existingRule.type,
        JSON.parse(ruleInputsDecryptor({ cipherTextBlob: existingRule.encryptedInputs }).toString()) as unknown
      )
    );
  };

  /**
   * Fetch all rules for a project and enforce them against the given secrets.
   *
   * When a `tx` is provided the duplicate-value lookup runs inside that
   * transaction, which lets the caller acquire a serializing lock beforehand
   * so the check and the subsequent write are atomic.
   *
   * When `expandSecretReferences` is provided, secret values containing
   * interpolation references (e.g. `${env.key}`) will be expanded to their
   * resolved values before validation so that constraints apply to the true
   * secret value rather than the raw reference string.
   */
  const validateSecrets = async ({
    projectId,
    environment,
    envId,
    secretPath,
    secrets,
    tx
  }: {
    projectId: string;
    environment: string;
    envId: string;
    secretPath: string;
    secrets: { key: string; value?: string; secretId?: string }[];
    tx?: Knex;
  }) => {
    if (!secrets.length) return;

    const rules = await secretValidationRuleDAL.find({ projectId, isActive: true });
    if (!rules.length) return;

    // Secret values and rule inputs share the SecretManager data key, so one
    // cipher pair serves both — this runs on every secret write.
    const { decryptor: secretManagerDecryptor } = await kmsService.createCipherPairWithDataKey({
      type: KmsDataKey.SecretManager,
      projectId
    });

    const { expandSecretReferences } = expandSecretReferencesFactory({
      projectId,
      folderDAL,
      secretDAL,
      decryptSecretValue: (value) => (value ? secretManagerDecryptor({ cipherTextBlob: value }).toString() : undefined),
      canExpandValue: () => true
    });

    const parsedRules = rules.map((r) => ({
      ...r,
      inputs: parseSecretValidationRuleInputs(
        r.type,
        JSON.parse(secretManagerDecryptor({ cipherTextBlob: r.encryptedInputs }).toString()) as unknown
      )
    }));

    // Filter to rules that actually match this environment + path so we don't
    // trigger expensive version-history lookups for unrelated rules.
    const matchingRules = parsedRules.filter((r) => {
      if (r.envId && r.envId !== envId) return false;
      return picomatch.isMatch(secretPath, r.secretPath, { strictSlashes: false });
    });

    const hasVersionHistoryConstraint = matchingRules.some((r) =>
      r.inputs.constraints?.some((c) => c.type === ConstraintType.UniqueSecretValue && c.value.secretVersions.enabled)
    );

    const duplicateValuesRule = matchingRules.find((r) =>
      r.inputs.constraints?.some((c) => c.type === ConstraintType.UniqueSecretValue && c.value.otherSecrets.enabled)
    );

    const previousValuesMap: Record<string, string[]> = {};
    if (hasVersionHistoryConstraint) {
      const secretIdsToCheck = secrets.filter((s) => s.secretId).map((s) => s.secretId!);
      if (secretIdsToCheck.length) {
        const allVersions = await Promise.all(
          secretIdsToCheck.map((sId) =>
            secretVersionV2BridgeDAL.find(
              { secretId: sId },
              { sort: [["version", "desc"]], limit: MAX_PREVENT_VALUE_REUSE_VERSIONS }
            )
          )
        );

        for (const versions of allVersions) {
          for (const version of versions) {
            if (!version.encryptedValue) {
              // eslint-disable-next-line no-continue
              continue;
            }
            const decryptedValue = secretManagerDecryptor({ cipherTextBlob: version.encryptedValue }).toString();
            if (!previousValuesMap[version.secretId]) {
              previousValuesMap[version.secretId] = [];
            }
            previousValuesMap[version.secretId].push(decryptedValue);
          }
        }
      }
    }

    // We build the map of all duplicate secrets (ignoring scope) and afterwards check
    // if any of those are part of the scope of the rule.
    const duplicateOfMap: Record<string, { key: string; environment: string; path: string }> = {};
    if (duplicateValuesRule) {
      if (tx) {
        // If two concurrent requests try to add two secrets with the same value, both will not find
        // a duplicate secret, so we need to ensure this is an atomic operation so the second request
        // can detect the first secret already has the same value and block the creation of the duplicated
        // secret.
        await tx.raw("SELECT pg_advisory_xact_lock(?)", [PgSqlLock.SecretValueUniqueCheck(projectId)]);
      }

      const project = await projectDAL.findById(projectId);
      if (project.secretBlindIndexEnabled) {
        const { generateSecretBlindIndex } = await kmsService.createCipherPairWithDataKey({
          type: KmsDataKey.SecretManager,
          projectId
        });

        const secretsWithValues = secrets.filter((s) => s.value !== undefined && !containsSecretReference(s.value));
        const blindIndexes = await Promise.all(
          secretsWithValues.map((s) => generateSecretBlindIndex(Buffer.from(s.value!)))
        );

        // Detect intra-batch duplicates (two secrets in the same request with the same value)
        // Those were not added yet, so we can't rely on the database check.
        const seenInBatch = new Map<string, { key: string; environment: string; path: string }>();
        for (let i = 0; i < secretsWithValues.length; i += 1) {
          const blindIndexValue = blindIndexes[i];
          if (seenInBatch.has(blindIndexValue)) {
            duplicateOfMap[secretsWithValues[i].key] = seenInBatch.get(blindIndexValue)!;
          } else {
            seenInBatch.set(blindIndexValue, { key: secretsWithValues[i].key, environment, path: secretPath });
          }
        }

        const uniqueBlindIndexes = [...new Set(blindIndexes.filter(Boolean))];
        if (uniqueBlindIndexes.length) {
          const excludeSecretIds = secretsWithValues.filter((s) => s.secretId).map((s) => s.secretId!);
          const ruleEnvId = duplicateValuesRule.envId ?? undefined;
          const existingDuplicates = await secretDAL.findExistingSecretsByBlindIndexes(
            projectId,
            uniqueBlindIndexes,
            excludeSecretIds.length ? excludeSecretIds : undefined,
            ruleEnvId,
            tx
          );

          if (existingDuplicates.length) {
            const folderIds = [...new Set(existingDuplicates.map((d) => d.folderId))];
            const folderPaths = await folderDAL.findSecretPathByFolderIds(projectId, folderIds);
            const folderIdToPath = new Map(folderIds.map((id, i) => [id, folderPaths[i]?.path ?? "/"]));

            const ruleSecretPath = duplicateValuesRule.secretPath;

            const blindIndexToExisting = new Map(
              existingDuplicates
                .filter((dup) => {
                  if (!dup.secretValueBlindIndex) return false;
                  const dupPath = folderIdToPath.get(dup.folderId) ?? "/";
                  return picomatch.isMatch(dupPath, ruleSecretPath, { strictSlashes: false });
                })
                .map((dup) => [
                  dup.secretValueBlindIndex!,
                  {
                    key: dup.key,
                    environment: dup.environment,
                    path: folderIdToPath.get(dup.folderId) ?? "/"
                  }
                ])
            );

            for (let i = 0; i < secretsWithValues.length; i += 1) {
              if (duplicateOfMap[secretsWithValues[i].key]) {
                // eslint-disable-next-line no-continue
                continue;
              }
              const existing = blindIndexToExisting.get(blindIndexes[i]);
              if (existing) {
                duplicateOfMap[secretsWithValues[i].key] = existing;
              }
            }
          }
        }
      }
    }

    const resolvedSecrets = await Promise.all(
      secrets.map(async (s) => ({
        key: s.key,
        value: await expandSecretReferences({
          value: s.value,
          secretPath,
          environment,
          secretKey: s.key
        }),
        ...(s.secretId && previousValuesMap[s.secretId] ? { previousValues: previousValuesMap[s.secretId] } : {}),
        ...(duplicateOfMap[s.key] ? { duplicateOf: duplicateOfMap[s.key] } : {})
      }))
    );

    enforceSecretValidationRules({
      projectRules: parsedRules,
      envId,
      secretPath,
      secrets: resolvedSecrets
    });
  };

  /**
   * Finds active validation rules that match a generated-credential flow
   * (dynamic secret lease or secret rotation) and returns the union of
   * their constraints for the password target.
   *
   * Multiple matching rules contribute their constraints additively — the
   * generator must satisfy all of them. Overlap is prevented at rule
   * creation time, so contradictions across rules are not expected here.
   */
  const findConstraintsForGeneratedSecret = async ({
    projectId,
    envId,
    secretPath,
    type,
    provider
  }: {
    projectId: string;
    envId: string;
    secretPath: string;
    type: SecretValidationRuleType.DynamicSecrets | SecretValidationRuleType.SecretRotations;
    provider: DynamicSecretRuleProvider | SecretRotationRuleProvider;
  }): Promise<{ constraints: TConstraint[]; ruleNames: string[] }> => {
    const rules = await secretValidationRuleDAL.find({ projectId, isActive: true, type });
    if (!rules.length) return { constraints: [], ruleNames: [] };

    const { decryptor: ruleInputsDecryptor } = await kmsService.createCipherPairWithDataKey({
      type: KmsDataKey.SecretManager,
      projectId
    });

    const constraints: TConstraint[] = [];
    const ruleNames: string[] = [];

    for (const rule of rules) {
      // Scope: rule envId null = applies to all environments
      if (rule.envId && rule.envId !== envId) {
        // eslint-disable-next-line no-continue
        continue;
      }
      if (!picomatch.isMatch(secretPath, rule.secretPath, { strictSlashes: false })) {
        // eslint-disable-next-line no-continue
        continue;
      }

      const parsed = parseSecretValidationRuleInputs(
        rule.type,
        JSON.parse(ruleInputsDecryptor({ cipherTextBlob: rule.encryptedInputs }).toString()) as unknown
      ) as TDynamicSecretsInputs | TSecretRotationsInputs;

      if (!parsed.providers?.includes(provider as never)) {
        // eslint-disable-next-line no-continue
        continue;
      }

      constraints.push(...parsed.constraints);
      ruleNames.push(rule.name);
    }

    return { constraints, ruleNames };
  };

  return {
    listByProjectId,
    createRule,
    updateRule,
    deleteRule,
    validateSecrets,
    findConstraintsForGeneratedSecret
  };
};
