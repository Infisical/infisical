import { ActionProjectType, TNhiPolicies } from "@app/db/schemas";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { OrgServiceActor } from "@app/lib/types";
import { ActorAuthMethod, ActorType } from "@app/services/auth/auth-type";

import { TNhiIdentityDALFactory } from "./nhi-dal";
import {
  NhiIdentityStatus,
  NhiPolicyActionTaken,
  NhiPolicyExecutionStatus,
  NhiRemediationActionType
} from "./nhi-enums";
import { TNhiPolicyDALFactory, TNhiPolicyExecutionDALFactory } from "./nhi-policy-dal";
import { TNhiRemediationServiceFactory } from "./nhi-remediation-service";
import {
  TCreateNhiPolicyDTO,
  TDeleteNhiPolicyDTO,
  TGetPolicyExecutionsDTO,
  TListNhiPoliciesDTO,
  TListRecentExecutionsDTO,
  TUpdateNhiPolicyDTO
} from "./nhi-types";

type TNhiPolicyServiceDep = {
  nhiPolicyDAL: TNhiPolicyDALFactory;
  nhiPolicyExecutionDAL: TNhiPolicyExecutionDALFactory;
  nhiIdentityDAL: TNhiIdentityDALFactory;
  nhiRemediationService: Pick<TNhiRemediationServiceFactory, "executeRemediationInternal">;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
};

export type TNhiPolicyServiceFactory = ReturnType<typeof nhiPolicyServiceFactory>;

const parseJsonField = (field: unknown): string[] => {
  if (!field) return [];
  if (typeof field === "string") return JSON.parse(field) as string[];
  if (Array.isArray(field)) return field as string[];
  return [];
};

const extractRiskFactorNames = (riskFactorsField: unknown): string[] => {
  let parsed: unknown[];
  if (typeof riskFactorsField === "string") {
    parsed = JSON.parse(riskFactorsField) as unknown[];
  } else if (Array.isArray(riskFactorsField)) {
    parsed = riskFactorsField;
  } else {
    return [];
  }
  // riskFactors are stored as [{factor: string, severity: string}, ...]
  return parsed
    .map((rf) => {
      if (typeof rf === "object" && rf !== null && "factor" in rf) {
        return (rf as { factor: string }).factor;
      }
      if (typeof rf === "string") return rf;
      return "";
    })
    .filter(Boolean);
};

/**
 * Check if an identity matches a policy's conditions (AND logic across conditions, OR within riskFactors).
 */
const matchesPolicy = (
  policy: TNhiPolicies,
  identity: { riskScore: number; type: string; provider: string },
  identityFactorSet: Set<string>
): boolean => {
  // Check conditionRiskFactors (OR — identity must have ANY listed factor)
  if (policy.conditionRiskFactors) {
    const factors = parseJsonField(policy.conditionRiskFactors);
    if (factors.length > 0) {
      const hasAny = factors.some((f) => identityFactorSet.has(f));
      if (!hasAny) return false;
    }
  }

  // Check conditionMinRiskScore
  if (policy.conditionMinRiskScore != null) {
    if (identity.riskScore < policy.conditionMinRiskScore) return false;
  }

  // Check conditionIdentityTypes
  if (policy.conditionIdentityTypes) {
    const types = parseJsonField(policy.conditionIdentityTypes);
    if (types.length > 0 && !types.includes(identity.type)) return false;
  }

  // Check conditionProviders
  if (policy.conditionProviders) {
    const providers = parseJsonField(policy.conditionProviders);
    if (providers.length > 0 && !providers.includes(identity.provider)) return false;
  }

  return true;
};

const determineActionTaken = (shouldRemediate: boolean, shouldFlag: boolean): NhiPolicyActionTaken => {
  if (shouldRemediate && shouldFlag) return NhiPolicyActionTaken.RemediateAndFlag;
  if (shouldRemediate) return NhiPolicyActionTaken.Remediate;
  return NhiPolicyActionTaken.Flag;
};

export const nhiPolicyServiceFactory = ({
  nhiPolicyDAL,
  nhiPolicyExecutionDAL,
  nhiIdentityDAL,
  nhiRemediationService,
  permissionService
}: TNhiPolicyServiceDep) => {
  const checkProjectPermission = async ({
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId,
    projectId
  }: {
    actor: ActorType;
    actorId: string;
    actorAuthMethod: ActorAuthMethod;
    actorOrgId: string;
    projectId: string;
  }) => {
    await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.NHI
    });
  };

  // --- CRUD ---

  const listPolicies = async ({ projectId, actor, actorId, actorAuthMethod, actorOrgId }: TListNhiPoliciesDTO) => {
    await checkProjectPermission({ actor, actorId, actorAuthMethod, actorOrgId, projectId });
    return nhiPolicyDAL.find({ projectId });
  };

  const createPolicy = async ({
    projectId,
    name,
    description,
    isEnabled,
    conditionRiskFactors,
    conditionMinRiskScore,
    conditionIdentityTypes,
    conditionProviders,
    actionRemediate,
    actionFlag,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId
  }: TCreateNhiPolicyDTO) => {
    await checkProjectPermission({ actor, actorId, actorAuthMethod, actorOrgId, projectId });

    if (!actionRemediate && !actionFlag) {
      throw new BadRequestError({ message: "At least one action (remediate or flag) must be specified" });
    }

    if (actionRemediate) {
      const validActions = Object.values(NhiRemediationActionType) as string[];
      if (!validActions.includes(actionRemediate)) {
        throw new BadRequestError({ message: `Invalid remediation action type: ${actionRemediate}` });
      }
    }

    return nhiPolicyDAL.create({
      projectId,
      name,
      description: description || null,
      isEnabled: isEnabled ?? true,
      conditionRiskFactors: conditionRiskFactors ? JSON.stringify(conditionRiskFactors) : null,
      conditionMinRiskScore: conditionMinRiskScore ?? null,
      conditionIdentityTypes: conditionIdentityTypes ? JSON.stringify(conditionIdentityTypes) : null,
      conditionProviders: conditionProviders ? JSON.stringify(conditionProviders) : null,
      actionRemediate: actionRemediate || null,
      actionFlag: actionFlag ?? false
    });
  };

  const updatePolicy = async ({
    policyId,
    projectId,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId,
    ...updates
  }: TUpdateNhiPolicyDTO) => {
    await checkProjectPermission({ actor, actorId, actorAuthMethod, actorOrgId, projectId });

    const existing = await nhiPolicyDAL.findById(policyId);
    if (!existing) {
      throw new NotFoundError({ message: `Policy with ID ${policyId} not found` });
    }

    const updateData: Record<string, unknown> = {};

    if (updates.name !== undefined) updateData.name = updates.name;
    if (updates.description !== undefined) updateData.description = updates.description;
    if (updates.isEnabled !== undefined) updateData.isEnabled = updates.isEnabled;
    if (updates.conditionRiskFactors !== undefined) {
      updateData.conditionRiskFactors = updates.conditionRiskFactors
        ? JSON.stringify(updates.conditionRiskFactors)
        : null;
    }
    if (updates.conditionMinRiskScore !== undefined) {
      updateData.conditionMinRiskScore = updates.conditionMinRiskScore;
    }
    if (updates.conditionIdentityTypes !== undefined) {
      updateData.conditionIdentityTypes = updates.conditionIdentityTypes
        ? JSON.stringify(updates.conditionIdentityTypes)
        : null;
    }
    if (updates.conditionProviders !== undefined) {
      updateData.conditionProviders = updates.conditionProviders ? JSON.stringify(updates.conditionProviders) : null;
    }
    if (updates.actionRemediate !== undefined) updateData.actionRemediate = updates.actionRemediate;
    if (updates.actionFlag !== undefined) updateData.actionFlag = updates.actionFlag;

    return nhiPolicyDAL.updateById(policyId, updateData);
  };

  const deletePolicy = async ({
    policyId,
    projectId,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId
  }: TDeleteNhiPolicyDTO) => {
    await checkProjectPermission({ actor, actorId, actorAuthMethod, actorOrgId, projectId });
    return nhiPolicyDAL.deleteById(policyId);
  };

  // --- Execution history ---

  const getPolicyExecutions = async ({
    policyId,
    projectId,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId
  }: TGetPolicyExecutionsDTO) => {
    await checkProjectPermission({ actor, actorId, actorAuthMethod, actorOrgId, projectId });
    return nhiPolicyExecutionDAL.findByPolicyId(policyId);
  };

  const listRecentExecutions = async ({
    projectId,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId
  }: TListRecentExecutionsDTO) => {
    await checkProjectPermission({ actor, actorId, actorAuthMethod, actorOrgId, projectId });
    return nhiPolicyExecutionDAL.findByProjectIdWithDetails(projectId);
  };

  // --- Policy evaluation helpers ---

  const executePolicyForIdentity = async ({
    policy,
    identity,
    scanId,
    projectId,
    orgServiceActor
  }: {
    policy: TNhiPolicies;
    identity: { id: string; status: string };
    scanId: string;
    projectId: string;
    orgServiceActor: OrgServiceActor;
  }) => {
    const shouldRemediate = Boolean(policy.actionRemediate);
    const shouldFlag = Boolean(policy.actionFlag);
    const actionTaken = determineActionTaken(shouldRemediate, shouldFlag);

    let status: NhiPolicyExecutionStatus = NhiPolicyExecutionStatus.Completed;
    let statusMessage: string | undefined;
    let remediationActionId: string | undefined;

    // Execute flag action
    if (shouldFlag && identity.status !== NhiIdentityStatus.Flagged) {
      try {
        await nhiIdentityDAL.updateById(identity.id, { status: NhiIdentityStatus.Flagged });
      } catch (err) {
        logger.warn(err, `Failed to flag identity ${identity.id} via policy ${policy.id}`);
        status = NhiPolicyExecutionStatus.Failed;
        statusMessage = `Flag failed: ${err instanceof Error ? err.message : "Unknown error"}`;
      }
    }

    // Execute remediation action
    if (shouldRemediate && policy.actionRemediate) {
      try {
        const remediationResult = await nhiRemediationService.executeRemediationInternal({
          identityId: identity.id,
          projectId,
          actionType: policy.actionRemediate as NhiRemediationActionType,
          triggeredBy: `policy:${policy.id}`,
          orgServiceActor
        });
        remediationActionId = remediationResult.id;

        if (remediationResult.status === "failed") {
          status = NhiPolicyExecutionStatus.Failed;
          statusMessage = remediationResult.statusMessage || "Remediation failed";
        }
      } catch (err) {
        logger.warn(err, `Policy remediation failed for identity ${identity.id}, policy ${policy.id}`);
        status = NhiPolicyExecutionStatus.Failed;
        statusMessage = `Remediation failed: ${err instanceof Error ? err.message : "Unknown error"}`;
      }
    }

    // Create execution record
    await nhiPolicyExecutionDAL.create({
      policyId: policy.id,
      identityId: identity.id,
      scanId,
      projectId,
      actionTaken,
      remediationActionId: remediationActionId || null,
      status,
      statusMessage: statusMessage || null
    });
  };

  // --- Policy evaluation (called after scan) ---

  const evaluatePolicies = async ({
    projectId,
    scanId,
    sourceId,
    orgServiceActor
  }: {
    projectId: string;
    scanId: string;
    sourceId: string;
    orgServiceActor: OrgServiceActor;
  }) => {
    const policies = await nhiPolicyDAL.findEnabledByProjectId(projectId);
    if (policies.length === 0) return;

    // Get all identities for this source (just scanned)
    const identities = await nhiIdentityDAL.find({ sourceId });
    if (identities.length === 0) return;

    const triggeredPolicyIds = new Set<string>();

    // Process each identity sequentially (required for proper remediation ordering)
    // eslint-disable-next-line no-restricted-syntax
    for (const identity of identities) {
      const factorNames = extractRiskFactorNames(identity.riskFactors);
      const identityFactorSet = new Set(factorNames);

      // eslint-disable-next-line no-restricted-syntax
      for (const policy of policies) {
        if (matchesPolicy(policy, identity, identityFactorSet)) {
          // eslint-disable-next-line no-await-in-loop
          await executePolicyForIdentity({
            policy,
            identity,
            scanId,
            projectId,
            orgServiceActor
          });
          triggeredPolicyIds.add(policy.id);
        }
      }
    }

    // Update lastTriggeredAt on matched policies
    const now = new Date();
    await Promise.all(
      [...triggeredPolicyIds].map((policyId) => nhiPolicyDAL.updateById(policyId, { lastTriggeredAt: now }))
    );
  };

  return {
    listPolicies,
    createPolicy,
    updatePolicy,
    deletePolicy,
    getPolicyExecutions,
    listRecentExecutions,
    evaluatePolicies
  };
};
