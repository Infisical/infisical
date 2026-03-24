import { ForbiddenError, subject } from "@casl/ability";
import picomatch from "picomatch";

import { ActionProjectType } from "@app/db/schemas";
import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { OrgServiceActor } from "@app/lib/types";

import { TPermissionServiceFactory } from "../permission/permission-service-types";
import { ProjectPermissionActions, ProjectPermissionSub } from "../permission/project-permission";
import { TPamResourceDALFactory } from "./pam-resource-dal";
import { TPamResourceRotationRulesDALFactory } from "./pam-resource-rotation-rules-dal";

type TPamResourceRotationRulesServiceFactoryDep = {
  pamResourceRotationRulesDAL: TPamResourceRotationRulesDALFactory;
  pamResourceDAL: Pick<TPamResourceDALFactory, "findById">;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
};

export type TPamResourceRotationRulesServiceFactory = ReturnType<typeof pamResourceRotationRulesServiceFactory>;

export const pamResourceRotationRulesServiceFactory = ({
  pamResourceRotationRulesDAL,
  pamResourceDAL,
  permissionService
}: TPamResourceRotationRulesServiceFactoryDep) => {
  const ensureEditPermission = async (resourceId: string, actor: OrgServiceActor) => {
    const resource = await pamResourceDAL.findById(resourceId);
    if (!resource) throw new NotFoundError({ message: `Resource with ID '${resourceId}' not found` });

    const { permission } = await permissionService.getProjectPermission({
      actor: actor.type,
      actorAuthMethod: actor.authMethod,
      actorId: actor.id,
      actorOrgId: actor.orgId,
      projectId: resource.projectId,
      actionProjectType: ActionProjectType.PAM
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Edit,
      subject(ProjectPermissionSub.PamResources, { name: resource.name })
    );

    return resource;
  };

  const listByResourceId = async (resourceId: string, actor: OrgServiceActor) => {
    const resource = await pamResourceDAL.findById(resourceId);
    if (!resource) throw new NotFoundError({ message: `Resource with ID '${resourceId}' not found` });

    const { permission } = await permissionService.getProjectPermission({
      actor: actor.type,
      actorAuthMethod: actor.authMethod,
      actorId: actor.id,
      actorOrgId: actor.orgId,
      projectId: resource.projectId,
      actionProjectType: ActionProjectType.PAM
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Read,
      subject(ProjectPermissionSub.PamResources, { name: resource.name })
    );

    const rules = await pamResourceRotationRulesDAL.findByResourceId(resourceId);
    return { rules, resource };
  };

  const create = async (
    {
      resourceId,
      name,
      namePattern,
      enabled,
      intervalSeconds
    }: {
      resourceId: string;
      name?: string;
      namePattern: string;
      enabled: boolean;
      intervalSeconds?: number | null;
    },
    actor: OrgServiceActor
  ) => {
    const resource = await ensureEditPermission(resourceId, actor);

    if (enabled && (intervalSeconds === undefined || intervalSeconds === null)) {
      throw new BadRequestError({ message: "Interval is required when the rule is enabled" });
    }

    // Validate glob pattern
    try {
      picomatch.parse(namePattern);
    } catch {
      throw new BadRequestError({ message: `Invalid glob pattern: ${namePattern}` });
    }

    const rule = await pamResourceRotationRulesDAL.transaction(async (tx) => {
      const maxPriority = await pamResourceRotationRulesDAL.getMaxPriority(resourceId, tx);

      return pamResourceRotationRulesDAL.create(
        {
          resourceId,
          name: name ?? null,
          namePattern,
          enabled,
          intervalSeconds: intervalSeconds ?? null,
          priority: maxPriority + 1
        },
        tx
      );
    });

    return { rule, resource };
  };

  const updateById = async (
    resourceId: string,
    ruleId: string,
    updates: {
      name?: string | null;
      namePattern?: string;
      enabled?: boolean;
      intervalSeconds?: number | null;
    },
    actor: OrgServiceActor
  ) => {
    const existingRule = await pamResourceRotationRulesDAL.findById(ruleId);
    if (!existingRule) throw new NotFoundError({ message: `Rotation rule with ID '${ruleId}' not found` });

    if (existingRule.resourceId !== resourceId) {
      throw new BadRequestError({ message: `Rule '${ruleId}' does not belong to resource '${resourceId}'` });
    }

    const resource = await ensureEditPermission(existingRule.resourceId, actor);

    const finalEnabled = updates.enabled ?? existingRule.enabled;
    const finalInterval =
      updates.intervalSeconds !== undefined ? updates.intervalSeconds : existingRule.intervalSeconds;

    if (finalEnabled && (finalInterval === undefined || finalInterval === null)) {
      throw new BadRequestError({ message: "Interval is required when the rule is enabled" });
    }

    if (updates.namePattern) {
      try {
        picomatch.parse(updates.namePattern);
      } catch {
        throw new BadRequestError({ message: `Invalid glob pattern: ${updates.namePattern}` });
      }
    }

    const rule = await pamResourceRotationRulesDAL.updateById(ruleId, updates);
    return { rule, resource };
  };

  const deleteById = async (resourceId: string, ruleId: string, actor: OrgServiceActor) => {
    const existingRule = await pamResourceRotationRulesDAL.findById(ruleId);
    if (!existingRule) throw new NotFoundError({ message: `Rotation rule with ID '${ruleId}' not found` });

    if (existingRule.resourceId !== resourceId) {
      throw new BadRequestError({ message: `Rule '${ruleId}' does not belong to resource '${resourceId}'` });
    }

    const resource = await ensureEditPermission(existingRule.resourceId, actor);

    const rule = await pamResourceRotationRulesDAL.deleteById(ruleId);
    return { rule, resource };
  };

  const reorderRules = async (resourceId: string, orderedRuleIds: string[], actor: OrgServiceActor) => {
    const resource = await ensureEditPermission(resourceId, actor);

    const existingRules = await pamResourceRotationRulesDAL.findByResourceId(resourceId);
    const existingIds = new Set(existingRules.map((r) => r.id));
    const uniqueRuleIds = new Set(orderedRuleIds);

    if (uniqueRuleIds.size !== orderedRuleIds.length) {
      throw new BadRequestError({ message: "Duplicate rule IDs are not allowed" });
    }

    for (const id of orderedRuleIds) {
      if (!existingIds.has(id)) {
        throw new BadRequestError({ message: `Rule ID '${id}' does not belong to resource '${resourceId}'` });
      }
    }

    if (orderedRuleIds.length !== existingRules.length) {
      throw new BadRequestError({ message: "All rules must be included in the reorder request" });
    }

    await pamResourceRotationRulesDAL.transaction(async (tx) => {
      // Set all priorities to negative (temp) to avoid unique constraint violations during reorder
      for (let i = 0; i < orderedRuleIds.length; i += 1) {
        // eslint-disable-next-line no-await-in-loop
        await pamResourceRotationRulesDAL.updateById(orderedRuleIds[i], { priority: -(i + 1) }, tx);
      }
      // Now set final priorities
      for (let i = 0; i < orderedRuleIds.length; i += 1) {
        // eslint-disable-next-line no-await-in-loop
        await pamResourceRotationRulesDAL.updateById(orderedRuleIds[i], { priority: i + 1 }, tx);
      }
    });

    const rules = await pamResourceRotationRulesDAL.findByResourceId(resourceId);
    return { rules, resource };
  };

  return {
    listByResourceId,
    create,
    updateById,
    deleteById,
    reorderRules
  };
};
