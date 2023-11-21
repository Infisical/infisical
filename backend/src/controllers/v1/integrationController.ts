import { Request, Response } from "express";
import { Types } from "mongoose";
import { Folder, IWorkspace, Integration, IntegrationAuth } from "../../models";
import { EventService } from "../../services";
import { eventStartIntegration } from "../../events";
import { getFolderByPath } from "../../services/FolderService";
import { BadRequestError } from "../../utils/errors";
import { EEAuditLogService } from "../../ee/services";
import { EventType } from "../../ee/models";
import { syncSecretsToActiveIntegrationsQueue } from "../../queues/integrations/syncSecretsToThirdPartyServices";
import { validateRequest } from "../../helpers/validation";
import * as reqValidator from "../../validation/integration";
import {
  ProjectPermissionActions,
  ProjectPermissionSub,
  getAuthDataProjectPermissions
} from "../../ee/services/ProjectRoleService";
import { ForbiddenError } from "@casl/ability";

/**
 * Create/initialize an (empty) integration for integration authorization
 * @param req
 * @param res
 * @returns
 */
export const createIntegration = async (req: Request, res: Response) => {
  const {
    body: {
      isActive,
      sourceEnvironment,
      secretPath,
      app,
      path,
      appId,
      owner,
      region,
      scope,
      targetService,
      targetServiceId,
      integrationAuthId,
      targetEnvironment,
      targetEnvironmentId,
      metadata
    }
  } = await validateRequest(reqValidator.CreateIntegrationV1, req);
  
  const integrationAuth = await IntegrationAuth.findById(integrationAuthId)
    .populate<{ workspace: IWorkspace }>("workspace")
    .select(
      "+refreshCiphertext +refreshIV +refreshTag +accessCiphertext +accessIV +accessTag +accessExpiresAt"
    );

  if (!integrationAuth) throw BadRequestError({ message: "Integration auth not found" });
  
  const { permission } = await getAuthDataProjectPermissions({
    authData: req.authData,
    workspaceId: integrationAuth.workspace._id
  });
  
  ForbiddenError.from(permission).throwUnlessCan(
    ProjectPermissionActions.Create,
    ProjectPermissionSub.Integrations
  );

  const folders = await Folder.findOne({
    workspace: integrationAuth.workspace._id,
    environment: sourceEnvironment
  });

  if (folders) {
    const folder = getFolderByPath(folders.nodes, secretPath);
    if (!folder) {
      throw BadRequestError({
        message: "Folder path doesn't exist"
      });
    }
  }

  // TODO: validate [sourceEnvironment] and [targetEnvironment]

  // initialize new integration after saving integration access token
  const integration = await new Integration({
    workspace: integrationAuth.workspace._id,
    environment: sourceEnvironment,
    isActive,
    app,
    appId,
    targetEnvironment,
    targetEnvironmentId,
    targetService,
    targetServiceId,
    owner,
    path,
    region,
    scope,
    secretPath,
    integration: integrationAuth.integration,
    integrationAuth: new Types.ObjectId(integrationAuthId),
    metadata
  }).save();

  if (integration) {
    // trigger event - push secrets
    EventService.handleEvent({
      event: eventStartIntegration({
        workspaceId: integration.workspace,
        environment: sourceEnvironment
      })
    });
  }

  await EEAuditLogService.createAuditLog(
    req.authData,
    {
      type: EventType.CREATE_INTEGRATION,
      metadata: {
        integrationId: integration._id.toString(),
        integration: integration.integration,
        environment: integration.environment,
        secretPath,
        url: integration.url,
        app: integration.app,
        appId: integration.appId,
        targetEnvironment: integration.targetEnvironment,
        targetEnvironmentId: integration.targetEnvironmentId,
        targetService: integration.targetService,
        targetServiceId: integration.targetServiceId,
        path: integration.path,
        region: integration.region
      }
    },
    {
      workspaceId: integration.workspace
    }
  );

  return res.status(200).send({
    integration
  });
};

/**
 * Change environment or name of integration with id [integrationId]
 * @param req
 * @param res
 * @returns
 */
export const updateIntegration = async (req: Request, res: Response) => {
  // TODO: add integration-specific validation to ensure that each
  // integration has the correct fields populated in [Integration]

  const {
    body: {
      environment,
      isActive,
      app,
      appId,
      targetEnvironment,
      owner, // github-specific integration param
      secretPath
    },
    params: { integrationId }
  } = await validateRequest(reqValidator.UpdateIntegrationV1, req);

  const integration = await Integration.findById(integrationId);
  if (!integration) throw BadRequestError({ message: "Integration not found" });

  const { permission } = await getAuthDataProjectPermissions({
    authData: req.authData,
    workspaceId: integration.workspace
  });

  ForbiddenError.from(permission).throwUnlessCan(
    ProjectPermissionActions.Edit,
    ProjectPermissionSub.Integrations
  );

  const folders = await Folder.findOne({
    workspace: integration.workspace,
    environment
  });

  if (folders) {
    const folder = getFolderByPath(folders.nodes, secretPath);
    if (!folder) {
      throw BadRequestError({
        message: "Path for service token does not exist"
      });
    }
  }

  const updatedIntegration = await Integration.findOneAndUpdate(
    {
      _id: integration._id
    },
    {
      environment,
      isActive,
      app,
      appId,
      targetEnvironment,
      owner,
      secretPath
    },
    {
      new: true
    }
  );

  if (updatedIntegration) {
    // trigger event - push secrets
    EventService.handleEvent({
      event: eventStartIntegration({
        workspaceId: updatedIntegration.workspace,
        environment
      })
    });
  }

  return res.status(200).send({
    integration: updatedIntegration
  });
};

/**
 * Delete integration with id [integrationId]
 * @param req
 * @param res
 * @returns
 */
export const deleteIntegration = async (req: Request, res: Response) => {
  const {
    params: { integrationId }
  } = await validateRequest(reqValidator.DeleteIntegrationV1, req);

  const integration = await Integration.findById(integrationId);
  if (!integration) throw BadRequestError({ message: "Integration not found" });

  const { permission } = await getAuthDataProjectPermissions({
    authData: req.authData,
    workspaceId: integration.workspace
  });

  ForbiddenError.from(permission).throwUnlessCan(
    ProjectPermissionActions.Delete,
    ProjectPermissionSub.Integrations
  );

  const deletedIntegration = await Integration.findOneAndDelete({
    _id: integrationId
  });

  if (!deletedIntegration) throw new Error("Failed to find integration");

  await EEAuditLogService.createAuditLog(
    req.authData,
    {
      type: EventType.DELETE_INTEGRATION,
      metadata: {
        integrationId: integration._id.toString(),
        integration: integration.integration,
        environment: integration.environment,
        secretPath: integration.secretPath,
        url: integration.url,
        app: integration.app,
        appId: integration.appId,
        targetEnvironment: integration.targetEnvironment,
        targetEnvironmentId: integration.targetEnvironmentId,
        targetService: integration.targetService,
        targetServiceId: integration.targetServiceId,
        path: integration.path,
        region: integration.region
      }
    },
    {
      workspaceId: integration.workspace
    }
  );

  return res.status(200).send({
    integration
  });
};

// Will trigger sync for all integrations within the given env and workspace id
export const manualSync = async (req: Request, res: Response) => {
  const {
    body: { workspaceId, environment }
  } = await validateRequest(reqValidator.ManualSyncV1, req);

  const { permission } = await getAuthDataProjectPermissions({
    authData: req.authData,
    workspaceId: new Types.ObjectId(workspaceId)
  });
  
  ForbiddenError.from(permission).throwUnlessCan(
    ProjectPermissionActions.Edit,
    ProjectPermissionSub.Integrations
  );

  syncSecretsToActiveIntegrationsQueue({
    workspaceId,
    environment
  });

  res.status(200).send();
};
