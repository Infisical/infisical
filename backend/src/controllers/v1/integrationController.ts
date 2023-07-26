import { Request, Response } from "express";
import { Types } from "mongoose";
import { Integration } from "../../models";
import { EventService } from "../../services";
import { eventStartIntegration } from "../../events";
import Folder from "../../models/folder";
import { getFolderByPath } from "../../services/FolderService";
import { BadRequestError } from "../../utils/errors";

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
    secretGroup
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
    secretGroup,
    integration: req.integrationAuth.integration,
    integrationAuth: new Types.ObjectId(integrationAuthId)
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
 * Delete integration with id [integrationId] and deactivate bot if there are
 * no integrations left
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

  return res.status(200).send({
    integration
  });
};
