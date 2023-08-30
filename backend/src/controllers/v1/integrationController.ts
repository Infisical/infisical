import { Request, Response } from "express";
import { Types } from "mongoose";
import { Folder, Integration } from "../../models";
import { EventService } from "../../services";
import { eventStartIntegration } from "../../events";
import { getFolderByPath } from "../../services/FolderService";
import { BadRequestError } from "../../utils/errors";
import { EEAuditLogService } from "../../ee/services";
import { EventType } from "../../ee/models";
import { syncSecretsToActiveIntegrationsQueue } from "../../queues/integrations/syncSecretsToThirdPartyServices";

/**
 * Create/initialize an (empty) integration for integration authorization
 * @param req
 * @param res
 * @returns
 */
export const createIntegration = async (req: Request, res: Response) => {
  const {
    integrationAuthId,
    app,
    appId,
    isActive,
    sourceEnvironment,
    targetEnvironment,
    targetEnvironmentId,
    targetService,
    targetServiceId,
    owner,
    path,
    region,
    secretPath,
    metadata
  } = req.body;

  const folders = await Folder.findOne({
    workspace: req.integrationAuth.workspace._id,
    environment: sourceEnvironment
  });

  if (folders) {
    const folder = getFolderByPath(folders.nodes, secretPath);
    if (!folder) {
      throw BadRequestError({
        message: "Path for service token does not exist"
      });
    }
  }

  // TODO: validate [sourceEnvironment] and [targetEnvironment]

  // initialize new integration after saving integration access token
  const integration = await new Integration({
    workspace: req.integrationAuth.workspace._id,
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
    secretPath,
    integration: req.integrationAuth.integration,
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
    environment,
    isActive,
    app,
    appId,
    targetEnvironment,
    owner, // github-specific integration param
    secretPath
  } = req.body;

  const folders = await Folder.findOne({
    workspace: req.integration.workspace,
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

  const integration = await Integration.findOneAndUpdate(
    {
      _id: req.integration._id
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

  if (integration) {
    // trigger event - push secrets
    EventService.handleEvent({
      event: eventStartIntegration({
        workspaceId: integration.workspace,
        environment
      })
    });
  }

  return res.status(200).send({
    integration
  });
};

/**
 * Delete integration with id [integrationId]
 * @param req
 * @param res
 * @returns
 */
export const deleteIntegration = async (req: Request, res: Response) => {
  const { integrationId } = req.params;

  const integration = await Integration.findOneAndDelete({
    _id: integrationId
  });

  if (!integration) throw new Error("Failed to find integration");

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
  const { workspaceId, environment } = req.body;
  syncSecretsToActiveIntegrationsQueue({
    workspaceId,
    environment
  })

  res.status(200).send()
};

