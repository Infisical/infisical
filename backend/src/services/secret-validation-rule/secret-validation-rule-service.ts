import { ForbiddenError } from "@casl/ability";

import { ActionProjectType } from "@app/db/schemas";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import { ProjectPermissionActions, ProjectPermissionSub } from "@app/ee/services/permission/project-permission";
import { NotFoundError } from "@app/lib/errors";
import { TProjectEnvDALFactory } from "@app/services/project-env/project-env-dal";

import { TKmsServiceFactory } from "../kms/kms-service";
import { KmsDataKey } from "../kms/kms-types";
import { TSecretValidationRuleDALFactory } from "./secret-validation-rule-dal";
import { checkForOverlappingRules, enforceSecretValidationRules } from "./secret-validation-rule-fns";
import { parseSecretValidationRuleInputs } from "./secret-validation-rule-schemas";
import {
  SecretValidationRuleType,
  TCreateSecretValidationRuleDTO,
  TDeleteSecretValidationRuleDTO,
  TListSecretValidationRulesDTO,
  TUpdateSecretValidationRuleDTO
} from "./secret-validation-rule-types";

type TSecretValidationRuleServiceFactoryDep = {
  secretValidationRuleDAL: TSecretValidationRuleDALFactory;
  projectEnvDAL: Pick<TProjectEnvDALFactory, "findOne">;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
  kmsService: TKmsServiceFactory;
};

export type TSecretValidationRuleServiceFactory = ReturnType<typeof secretValidationRuleServiceFactory>;

export const secretValidationRuleServiceFactory = ({
  secretValidationRuleDAL,
  projectEnvDAL,
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

    const finalRules = (rules || []).map((rule) => ({
      ...rule,
      type: rule.type as SecretValidationRuleType,
      inputs: parseSecretValidationRuleInputs(
        rule.type,
        JSON.parse(ruleInputsDecryptor({ cipherTextBlob: rule.encryptedInputs }).toString()) as unknown
      )
    }));

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
    type,
    inputs
  }: TCreateSecretValidationRuleDTO) => {
    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.SecretManager
    });
    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Create, ProjectPermissionSub.Settings);

    let envId: string | null = null;
    if (environmentSlug) {
      const env = await projectEnvDAL.findOne({ projectId, slug: environmentSlug });
      if (!env) {
        throw new NotFoundError({ message: `Environment with slug '${environmentSlug}' not found in project` });
      }
      envId = env.id;
    }

    const parsedInputs = parseSecretValidationRuleInputs(type, inputs);

    const { decryptor: ruleInputsDecryptor } = await kmsService.createCipherPairWithDataKey({
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

    const { encryptor: ruleInputsEncryptor } = await kmsService.createCipherPairWithDataKey({
      type: KmsDataKey.SecretManager,
      projectId
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

    return { ...rule, type: rule.type as SecretValidationRuleType, inputs: parsedInputs };
  };

  const updateRule = async ({
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId,
    projectId,
    ruleId,
    environmentSlug,
    inputs,
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

    const { decryptor: ruleInputsDecryptor } = await kmsService.createCipherPairWithDataKey({
      type: KmsDataKey.SecretManager,
      projectId
    });

    const decryptedExistingRuleInputs = ruleInputsDecryptor({
      cipherTextBlob: existingRule.encryptedInputs
    });

    const ruleType = dto.type ?? existingRule.type;
    const ruleInputs = inputs ?? (JSON.parse(decryptedExistingRuleInputs.toString()) as unknown);
    const parsedInputs = parseSecretValidationRuleInputs(ruleType, ruleInputs);

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

    let updatedRuleInputs: Buffer | undefined;

    if (inputs) {
      const { encryptor: ruleInputsEncryptor } = await kmsService.createCipherPairWithDataKey({
        type: KmsDataKey.SecretManager,
        projectId
      });

      const { cipherTextBlob: encryptedRuleInputs } = ruleInputsEncryptor({
        plainText: Buffer.from(JSON.stringify(parsedInputs))
      });
      updatedRuleInputs = encryptedRuleInputs;
    }

    const updatedRule = await secretValidationRuleDAL.updateById(ruleId, {
      ...(envId !== undefined && { envId }),
      ...(Boolean(updatedRuleInputs) && { encryptedInputs: updatedRuleInputs }),
      ...dto
    });

    return {
      ...updatedRule,
      type: updatedRule.type as SecretValidationRuleType,
      inputs: parseSecretValidationRuleInputs(
        updatedRule.type,
        JSON.parse(ruleInputsDecryptor({ cipherTextBlob: updatedRule.encryptedInputs }).toString()) as unknown
      )
    };
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
    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Delete, ProjectPermissionSub.Settings);

    const existingRule = await secretValidationRuleDAL.findOne({ id: ruleId, projectId });
    if (!existingRule) {
      throw new NotFoundError({ message: `Secret validation rule with ID ${ruleId} not found` });
    }

    const { decryptor: ruleInputsDecryptor } = await kmsService.createCipherPairWithDataKey({
      type: KmsDataKey.SecretManager,
      projectId
    });

    await secretValidationRuleDAL.deleteById(ruleId);
    return {
      ...existingRule,
      type: existingRule.type as SecretValidationRuleType,
      inputs: parseSecretValidationRuleInputs(
        existingRule.type,
        JSON.parse(ruleInputsDecryptor({ cipherTextBlob: existingRule.encryptedInputs }).toString()) as unknown
      )
    };
  };

  /**
   * Fetch all rules for a project and enforce them against the given secrets.
   * Called by secret write paths before the DB transaction starts.
   */
  const validateSecrets = async ({
    projectId,
    envId,
    secretPath,
    secrets
  }: {
    projectId: string;
    envId: string;
    secretPath: string;
    secrets: { key: string; value?: string }[];
  }) => {
    if (!secrets.length) return;

    const rules = await secretValidationRuleDAL.find({ projectId, isActive: true });
    if (!rules.length) return;

    const { decryptor: ruleInputsDecryptor } = await kmsService.createCipherPairWithDataKey({
      type: KmsDataKey.SecretManager,
      projectId
    });

    enforceSecretValidationRules({
      projectRules: rules.map((r) => ({
        ...r,
        inputs: parseSecretValidationRuleInputs(
          r.type,
          JSON.parse(ruleInputsDecryptor({ cipherTextBlob: r.encryptedInputs }).toString()) as unknown
        )
      })),
      envId,
      secretPath,
      secrets
    });
  };

  return {
    listByProjectId,
    createRule,
    updateRule,
    deleteRule,
    validateSecrets
  };
};
