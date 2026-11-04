import { ForbiddenError, subject } from "@casl/ability";
import { z } from "zod";

import { ActionProjectType } from "@app/db/schemas";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import {
  ProjectPermissionSecretRotationActions,
  ProjectPermissionSub
} from "@app/ee/services/permission/project-permission";
import { SecretRotation } from "@app/ee/services/secret-rotation-v2/secret-rotation-v2-enums";
import {
  SECRET_ROTATION_FAILED_EVENT,
  SECRET_ROTATION_RESOURCE_TYPE,
  SecretRotationFailedPayloadSchema
} from "@app/ee/services/secret-rotation-v2/secret-rotation-v2-events";
import { SECRET_ROTATION_NAME_MAP } from "@app/ee/services/secret-rotation-v2/secret-rotation-v2-maps";
import { getConfig } from "@app/lib/config/env";
import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { TSecretFolderDALFactory } from "@app/services/secret-folder/secret-folder-dal";

import { TAlertPayload } from "../alert-channel-types";
import { formatUtcDate } from "../alert-format-fns";
import {
  AlertPermissionAction,
  AlertTriggerType,
  IEventAlertProvider,
  TAlertContext,
  TAlertPermissionInput,
  TFindEventTargetsInput
} from "../alert-types";
import { TSecretRotationAlertDALFactory, TSecretRotationWithLocation } from "./secret-rotation-alert-dal";

const SecretRotationFailedConditionSchema = z.object({}).nullish();

export type TSecretRotationTarget = TSecretRotationWithLocation & {
  secretPath: string;
  attemptedAt: Date;
};

export type TSecretRotationAlertProviderDep = {
  secretRotationAlertDAL: Pick<TSecretRotationAlertDALFactory, "findRotationsByIds" | "findRotationNamesByIds">;
  folderDAL: Pick<TSecretFolderDALFactory, "findSecretPathByFolderIds">;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
};

const providerName = (rotationType: string) => SECRET_ROTATION_NAME_MAP[rotationType as SecretRotation] ?? rotationType;

export const secretRotationAlertProviderFactory = ({
  secretRotationAlertDAL,
  folderDAL,
  permissionService
}: TSecretRotationAlertProviderDep): IEventAlertProvider<TSecretRotationTarget> => {
  const $loadRotationsWithPath = async (rotationIds: string[]) => {
    const rotations = await secretRotationAlertDAL.findRotationsByIds(rotationIds);
    const paths = new Map<string, string>();
    const folderIdsByProject = new Map<string, string[]>();
    rotations.forEach((rotation) => {
      folderIdsByProject.set(rotation.projectId, [
        ...(folderIdsByProject.get(rotation.projectId) ?? []),
        rotation.folderId
      ]);
    });
    for (const [projectId, folderIds] of folderIdsByProject) {
      // The path decides what a permission check allows, so it comes from the primary like the rotation.
      // eslint-disable-next-line no-await-in-loop -- a failure event names one rotation, so this is one project
      const folders = await folderDAL.findSecretPathByFolderIds(projectId, folderIds, undefined, {
        readFromPrimary: true
      });
      folders.forEach((folder) => {
        if (folder?.path) paths.set(folder.id, folder.path);
      });
    }
    // A rotation whose path cannot be resolved is left out rather than treated as sitting at the root,
    // which would check permissions against the wrong path.
    return rotations.flatMap((rotation) => {
      const secretPath = paths.get(rotation.folderId);
      return secretPath ? [{ ...rotation, secretPath }] : [];
    });
  };

  const findEventTargets = async (input: TFindEventTargetsInput): Promise<TSecretRotationTarget[]> => {
    if (input.eventType !== SECRET_ROTATION_FAILED_EVENT) return [];

    const parsed = SecretRotationFailedPayloadSchema.safeParse(input.payload);
    if (!parsed.success) {
      throw new Error(
        `Unreadable '${SECRET_ROTATION_FAILED_EVENT}' payload: ${parsed.error.issues
          .map((issue) => `${issue.path.join(".")} ${issue.message}`)
          .join(", ")}`
      );
    }

    const rotations = await $loadRotationsWithPath(input.targetIds);
    return rotations
      .filter((rotation) => rotation.orgId === input.orgId && rotation.projectId === input.projectId)
      .map((rotation) => ({ ...rotation, attemptedAt: parsed.data.attemptedAt }));
  };

  const buildViewUrl = async (alert: TAlertContext): Promise<string> => {
    const base = `${getConfig().SITE_URL}/organizations/${alert.orgId}/projects/secret-management/${alert.projectId}/overview`;
    if (!alert.resourceId) return base;

    const [rotation] = await $loadRotationsWithPath([alert.resourceId]);
    if (!rotation) return base;

    const query = new URLSearchParams({
      secretPath: rotation.secretPath,
      environments: JSON.stringify([rotation.envSlug]),
      search: rotation.rotationName
    });
    return `${base}?${query.toString()}`;
  };

  const buildPayload = (alert: TAlertContext, targets: TSecretRotationTarget[], viewUrl: string): TAlertPayload => {
    const [first] = targets;
    return {
      alert: {
        id: alert.id,
        name: alert.name,
        orgId: alert.orgId,
        ...(alert.projectId ? { projectId: alert.projectId } : {}),
        resourceType: alert.resourceType,
        ...(alert.resourceId ? { resourceId: alert.resourceId } : {}),
        viewUrl
      },
      eventKey: SECRET_ROTATION_FAILED_EVENT,
      eventLabel: "Rotation Failure",
      webhookType: "com.infisical.secret.rotation.failed",
      resourceKind: "Secret Rotation",
      resourceOwnerKind: "Secret Rotation",
      severity: "error",
      summary: first
        ? `${providerName(first.rotationType)} rotation '${first.rotationName}' failed in ${first.envName}`
        : "Secret rotation failed",
      items: targets.map((target) => ({
        id: target.rotationId,
        title: target.rotationName,
        fields: [
          { label: "Provider", value: providerName(target.rotationType) },
          { label: "Environment", value: target.envName },
          { label: "Path", value: target.secretPath },
          { label: "Last Attempt", value: formatUtcDate(target.attemptedAt) }
        ]
      }))
    };
  };

  const $requireProject = (projectId?: string | null): string => {
    if (!projectId) {
      throw new BadRequestError({ message: "Secret rotation alerts must be managed within a project" });
    }
    return projectId;
  };

  const $loadInScopeRotation = async (input: { orgId: string; projectId: string; resourceId: string }) => {
    const [rotation] = await $loadRotationsWithPath([input.resourceId]);
    if (!rotation || rotation.orgId !== input.orgId || rotation.projectId !== input.projectId) {
      throw new NotFoundError({ message: `Secret rotation with ID '${input.resourceId}' not found in this project` });
    }
    return rotation;
  };

  // Without a resourceId there is nothing to bind-check: that is a test send from the create form, before
  // the rotation exists. Creating an alert without one is refused earlier, since this provider has no
  // scope-wide alerts.
  const assertResourceInScope = async (input: {
    orgId: string;
    projectId?: string | null;
    resourceId?: string | null;
  }): Promise<void> => {
    const projectId = $requireProject(input.projectId);
    if (!input.resourceId) return;
    await $loadInScopeRotation({ orgId: input.orgId, projectId, resourceId: input.resourceId });
  };

  const assertPermission = async (input: TAlertPermissionInput): Promise<void> => {
    const projectId = $requireProject(input.projectId);
    const { permission } = await permissionService.getProjectPermission({
      actor: input.actor.actor,
      actorId: input.actor.actorId,
      projectId,
      actorAuthMethod: input.actor.actorAuthMethod,
      actorOrgId: input.actor.actorOrgId,
      actionProjectType: ActionProjectType.SecretManager
    });

    if (!input.resourceId) {
      // Listing a project's rotation alerts, or a test send for a rotation that is still being created.
      const action =
        input.action === AlertPermissionAction.Read
          ? ProjectPermissionSecretRotationActions.Read
          : ProjectPermissionSecretRotationActions.Create;
      ForbiddenError.from(permission).throwUnlessCan(action, ProjectPermissionSub.SecretRotation);
      return;
    }

    const rotation = await $loadInScopeRotation({ orgId: input.orgId, projectId, resourceId: input.resourceId });
    ForbiddenError.from(permission).throwUnlessCan(
      input.action === AlertPermissionAction.Read
        ? ProjectPermissionSecretRotationActions.Read
        : ProjectPermissionSecretRotationActions.Edit,
      subject(ProjectPermissionSub.SecretRotation, {
        environment: rotation.envSlug,
        secretPath: rotation.secretPath,
        connectionId: rotation.connectionId
      })
    );
  };

  return {
    resourceType: SECRET_ROTATION_RESOURCE_TYPE,
    events: [
      {
        key: SECRET_ROTATION_FAILED_EVENT,
        triggerType: AlertTriggerType.Event,
        conditionSchema: SecretRotationFailedConditionSchema
      }
    ],
    findEventTargets,
    buildViewUrl,
    buildPayload,
    targetId: (target) => target.rotationId,
    assertPermission,
    assertResourceInScope,
    resolveProjectId: async ({ orgId, resourceId }) => {
      if (!resourceId) {
        throw new BadRequestError({ message: "Secret rotation alerts must be managed within a project" });
      }
      const [rotation] = await secretRotationAlertDAL.findRotationsByIds([resourceId]);
      if (!rotation || rotation.orgId !== orgId) {
        throw new NotFoundError({ message: `Secret rotation with ID '${resourceId}' not found` });
      }
      return rotation.projectId;
    },
    getResourceNames: async ({ orgId, resourceIds }) =>
      new Map(
        (await secretRotationAlertDAL.findRotationNamesByIds(resourceIds, orgId)).map((rotation) => [
          rotation.id,
          rotation.name
        ])
      )
  };
};
