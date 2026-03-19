import { ForbiddenError } from "@casl/ability";

import { ActionProjectType } from "@app/db/schemas";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import { ProjectPermissionActions, ProjectPermissionSub } from "@app/ee/services/permission/project-permission";
import { NotFoundError } from "@app/lib/errors";
import { TProjectEnvDALFactory } from "@app/services/project-env/project-env-dal";

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
};

export type TSecretValidationRuleServiceFactory = ReturnType<typeof secretValidationRuleServiceFactory>;

export const secretValidationRuleServiceFactory = ({
  secretValidationRuleDAL,
  projectEnvDAL,
  permissionService
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

    return (rules || []).map((rule) => ({
      ...rule,
      type: rule.type as SecretValidationRuleType,
      inputs: parseSecretValidationRuleInputs(rule.type, rule.inputs)
    }));
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

    const existingRules = await secretValidationRuleDAL.find({ projectId });
    checkForOverlappingRules({
      ruleType: type,
      envId,
      secretPath,
      inputs: parsedInputs,
      existingRules
    });

    const rule = await secretValidationRuleDAL.create({
      name,
      description,
      projectId,
      envId,
      secretPath,
      type,
      inputs: parsedInputs
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

    const existingRule = await secretValidationRuleDAL.findById(ruleId);
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

    const ruleType = dto.type ?? existingRule.type;
    const ruleInputs = inputs ?? existingRule.inputs;
    const parsedInputs = parseSecretValidationRuleInputs(ruleType, ruleInputs);

    const finalEnvId = envId !== undefined ? envId : (existingRule.envId as string | null);
    const finalSecretPath = dto.secretPath ?? existingRule.secretPath;

    const existingRules = await secretValidationRuleDAL.find({ projectId });
    checkForOverlappingRules({
      ruleType: ruleType as SecretValidationRuleType,
      envId: finalEnvId,
      secretPath: finalSecretPath,
      inputs: parsedInputs,
      existingRules,
      excludeRuleId: ruleId
    });

    const updatedRule = await secretValidationRuleDAL.updateById(ruleId, {
      ...(envId !== undefined && { envId }),
      ...(Boolean(inputs) && { inputs: parsedInputs }),
      ...dto
    });

    return {
      ...updatedRule,
      type: updatedRule.type as SecretValidationRuleType,
      inputs: parseSecretValidationRuleInputs(updatedRule.type, updatedRule.inputs)
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

    const existingRule = await secretValidationRuleDAL.findById(ruleId);
    if (!existingRule) {
      throw new NotFoundError({ message: `Secret validation rule with ID ${ruleId} not found` });
    }

    await secretValidationRuleDAL.deleteById(ruleId);
    return {
      ...existingRule,
      type: existingRule.type as SecretValidationRuleType,
      inputs: parseSecretValidationRuleInputs(existingRule.type, existingRule.inputs)
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

    const rules = await secretValidationRuleDAL.find({ projectId });
    if (!rules.length) return;

    enforceSecretValidationRules({
      projectRules: rules.map((r) => ({
        ...r,
        isActive: r.isActive ?? true
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
