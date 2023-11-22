import { Request, Response } from "express";
import { Types } from "mongoose";
import {
  Folder,
  Integration,
  Membership,
  Secret,
  ServiceToken,
  ServiceTokenData,
  Workspace
} from "../../models";
import { EventType, SecretVersion } from "../../ee/models";
import { EEAuditLogService, EELicenseService } from "../../ee/services";
import { BadRequestError, WorkspaceNotFoundError } from "../../utils/errors";
import { validateRequest } from "../../helpers/validation";
import * as reqValidator from "../../validation/environments";
import {
  ProjectPermissionActions,
  ProjectPermissionSub,
  getAuthDataProjectPermissions
} from "../../ee/services/ProjectRoleService";
import { ForbiddenError } from "@casl/ability";
import { SecretImport } from "../../models";
import { Webhook } from "../../models";

/**
 * Create new workspace environment named [environmentName]
 * with slug [environmentSlug] under workspace with id
 * @param req
 * @param res
 * @returns
 */
export const createWorkspaceEnvironment = async (req: Request, res: Response) => {
  /*
    #swagger.summary = 'Create environment'
    #swagger.description = 'Create environment'

    #swagger.security = [{
        "apiKeyAuth": [],
    }]

	#swagger.parameters['workspaceId'] = {
		"description": "ID of workspace where to create environment",
		"required": true,
		"type": "string",
    "in": "path"
	}
  
  #swagger.requestBody = {
      content: {
          "application/json": {
              "schema": {
                  "type": "object",
                  "properties": {
                      "environmentName": {
                          "type": "string",
                          "description": "Name of the environment to create",
                          "example": "development"
                      },
                      "environmentSlug": {
                          "type": "string",
                          "description": "Slug of environment to create",
                          "example": "dev-environment"
                      }
                  },
                  "required": ["environmentName", "environmentSlug"]
              }
          }
      }
  }

  #swagger.responses[200] = {
        content: {
            "application/json": {
                "schema": {
                    "type": "object",
                    "properties": {
                        "message": {
                            "type": "string",
                            "description": "Sucess message",
                            "example": "Successfully created environment"
                        },
                        "workspace": {
                            "type": "string",
                            "description": "ID of workspace where environment was created",
                            "example": "abc123"
                        },
                        "environment": {
                            "type": "object",
                            "properties": {
                                "name": {
                                    "type": "string",
                                    "description": "Name of created environment",
                                    "example": "Staging"
                                },
                                "slug": {
                                    "type": "string",
                                    "description": "Slug of created environment",
                                    "example": "staging"
                                }
                            }
                        }
                    },
                    "description": "Details of the created environment"
                }
            }
        }
    }
  */
  const {
    params: { workspaceId },
    body: { environmentName, environmentSlug }
  } = await validateRequest(reqValidator.CreateWorkspaceEnvironmentV2, req);

  const { permission } = await getAuthDataProjectPermissions({
    authData: req.authData,
    workspaceId: new Types.ObjectId(workspaceId)
  });
  
  ForbiddenError.from(permission).throwUnlessCan(
    ProjectPermissionActions.Create,
    ProjectPermissionSub.Environments
  );

  const workspace = await Workspace.findById(workspaceId).exec();

  if (!workspace) throw WorkspaceNotFoundError();

  const plan = await EELicenseService.getPlan(workspace.organization);

  if (plan.environmentLimit !== null) {
    // case: limit imposed on number of environments allowed
    if (workspace.environments.length >= plan.environmentLimit) {
      // case: number of environments used exceeds the number of environments allowed

      return res.status(400).send({
        message:
          "Failed to create environment due to environment limit reached. Upgrade plan to create more environments."
      });
    }
  }

  if (
    !workspace ||
    workspace?.environments.find(
      ({ name, slug }) => slug === environmentSlug || environmentName === name
    )
  ) {
    throw new Error("Failed to create workspace environment");
  }

  workspace?.environments.push({
    name: environmentName,
    slug: environmentSlug.toLowerCase()
  });
  await workspace.save();

  await EELicenseService.refreshPlan(workspace.organization, new Types.ObjectId(workspaceId));

  await EEAuditLogService.createAuditLog(
    req.authData,
    {
      type: EventType.CREATE_ENVIRONMENT,
      metadata: {
        name: environmentName,
        slug: environmentSlug
      }
    },
    {
      workspaceId: workspace._id
    }
  );

  return res.status(200).send({
    message: "Successfully created new environment",
    workspace: workspaceId,
    environment: {
      name: environmentName,
      slug: environmentSlug
    }
  });
};

/**
 * Swaps the ordering of two environments in the database. This is purely for aesthetic purposes.
 * @param req
 * @param res
 * @returns
 */
export const reorderWorkspaceEnvironments = async (req: Request, res: Response) => {
  const {
    params: { workspaceId },
    body: { environmentName, environmentSlug, otherEnvironmentSlug, otherEnvironmentName }
  } = await validateRequest(reqValidator.ReorderWorkspaceEnvironmentsV2, req);

  const { permission } = await getAuthDataProjectPermissions({
    authData: req.authData,
    workspaceId: new Types.ObjectId(workspaceId)
  });

  ForbiddenError.from(permission).throwUnlessCan(
    ProjectPermissionActions.Edit,
    ProjectPermissionSub.Environments
  );

  // atomic update the env to avoid conflict
  const workspace = await Workspace.findById(workspaceId).exec();
  if (!workspace) {
    throw BadRequestError({ message: "Couldn't load workspace" });
  }

  const environmentIndex = workspace.environments.findIndex(
    (env) => env.name === environmentName && env.slug === environmentSlug
  );
  const otherEnvironmentIndex = workspace.environments.findIndex(
    (env) => env.name === otherEnvironmentName && env.slug === otherEnvironmentSlug
  );

  if (environmentIndex === -1 || otherEnvironmentIndex === -1) {
    throw BadRequestError({ message: "environment or otherEnvironment couldn't be found" });
  }

  // swap the order of the environments
  [workspace.environments[environmentIndex], workspace.environments[otherEnvironmentIndex]] = [
    workspace.environments[otherEnvironmentIndex],
    workspace.environments[environmentIndex]
  ];

  await workspace.save();

  return res.status(200).send({
    message: "Successfully reordered environments",
    workspace: workspaceId
  });
};

/**
 * Rename workspace environment with new name and slug of a workspace with [workspaceId]
 * Old slug [oldEnvironmentSlug] must be provided
 * @param req
 * @param res
 * @returns
 */
export const renameWorkspaceEnvironment = async (req: Request, res: Response) => {
  /*
    #swagger.summary = 'Update environment'
    #swagger.description = 'Update environment'

    #swagger.security = [{
        "apiKeyAuth": [],
    }]

    #swagger.parameters['workspaceId'] = {
      "description": "ID of workspace where to update environment",
      "required": true,
      "type": "string",
      "in": "path"
    }

    #swagger.requestBody = {
        content: {
            "application/json": {
                "schema": {
                    "type": "object",
                    "properties": {
                        "environmentName": {
                            "type": "string",
                            "description": "Name of environment to update to",
                            "example": "Staging-Renamed"
                        },
                        "environmentSlug": {
                            "type": "string",
                            "description": "Slug of environment to update to",
                            "example": "staging-renamed"
                        },
                        "oldEnvironmentSlug": {
                            "type": "string",
                            "description": "Current slug of environment",
                            "example": "staging-old"
                        }
                    },
                    "required": ["environmentName", "environmentSlug", "oldEnvironmentSlug"]
                }
            }
        }
    }

    #swagger.responses[200] = {
        content: {
            "application/json": {
                "schema": {
                    "type": "object",
                    "properties": {
                        "message": {
                            "type": "string",
                            "description": "Success message",
                            "example": "Successfully update environment"
                        },
                        "workspace": {
                            "type": "string",
                            "description": "ID of workspace where environment was updated",
                            "example": "abc123"
                        },
                        "environment": {
                            "type": "object",
                            "properties": {
                                "name": {
                                    "type": "string",
                                    "description": "Name of updated environment",
                                    "example": "Staging-Renamed"
                                },
                                "slug": {
                                    "type": "string",
                                    "description": "Slug of updated environment",
                                    "example": "staging-renamed"
                                }
                            }
                        }
                    },
                    "description": "Details of the renamed environment"
                }
            }
        }
    }
  */
  const {
    params: { workspaceId },
    body: { environmentName, environmentSlug, oldEnvironmentSlug }
  } = await validateRequest(reqValidator.UpdateWorkspaceEnvironmentV2, req);

  const { permission } = await getAuthDataProjectPermissions({
    authData: req.authData,
    workspaceId: new Types.ObjectId(workspaceId)
  });

  ForbiddenError.from(permission).throwUnlessCan(
    ProjectPermissionActions.Edit,
    ProjectPermissionSub.Environments
  );

  // user should pass both new slug and env name
  if (!environmentSlug || !environmentName) {
    throw new Error("Invalid environment given.");
  }

  // atomic update the env to avoid conflict
  const workspace = await Workspace.findById(workspaceId).exec();
  if (!workspace) {
    throw new Error("Failed to create workspace environment");
  }

  const isEnvExist = workspace.environments.some(
    ({ name, slug }) =>
      slug !== oldEnvironmentSlug && (name === environmentName || slug === environmentSlug)
  );
  if (isEnvExist) {
    throw new Error("Invalid environment given");
  }

  const envIndex = workspace?.environments.findIndex(({ slug }) => slug === oldEnvironmentSlug);
  if (envIndex === -1) {
    throw new Error("Invalid environment given");
  }

  const oldEnvironment = workspace.environments[envIndex];

  workspace.environments[envIndex].name = environmentName;
  workspace.environments[envIndex].slug = environmentSlug.toLowerCase();

  await workspace.save();
  await Secret.updateMany(
    { workspace: workspaceId, environment: oldEnvironmentSlug },
    { environment: environmentSlug }
  );
  await SecretVersion.updateMany(
    { workspace: workspaceId, environment: oldEnvironmentSlug },
    { environment: environmentSlug }
  );
  await ServiceToken.updateMany(
    { workspace: workspaceId, environment: oldEnvironmentSlug },
    { environment: environmentSlug }
  );
  await ServiceTokenData.updateMany(
    {
      workspace: workspaceId,
      "scopes.environment": oldEnvironmentSlug
    },
    { $set: { "scopes.$[element].environment": environmentSlug } },
    { arrayFilters: [{ "element.environment": oldEnvironmentSlug }] }
  );
  await Integration.updateMany(
    { workspace: workspaceId, environment: oldEnvironmentSlug },
    { environment: environmentSlug }
  );

  await Folder.updateMany(
    { workspace: workspaceId, environment: oldEnvironmentSlug },
    { environment: environmentSlug }
  );

  await SecretImport.updateMany(
    { workspace: workspaceId, environment: oldEnvironmentSlug },
    { environment: environmentSlug }
  );
  await SecretImport.updateMany(
    { workspace: workspaceId, "imports.environment": oldEnvironmentSlug },
    { $set: { "imports.$[element].environment": environmentSlug } },
    { arrayFilters: [{ "element.environment": oldEnvironmentSlug }] },
  );

  await Webhook.updateMany(
    { workspace: workspaceId, environment: oldEnvironmentSlug },
    { environment: environmentSlug }
  );

  await Membership.updateMany(
    {
      workspace: workspaceId,
      "deniedPermissions.environmentSlug": oldEnvironmentSlug
    },
    { $set: { "deniedPermissions.$[element].environmentSlug": environmentSlug } },
    { arrayFilters: [{ "element.environmentSlug": oldEnvironmentSlug }] }
  );

  await EEAuditLogService.createAuditLog(
    req.authData,
    {
      type: EventType.UPDATE_ENVIRONMENT,
      metadata: {
        oldName: oldEnvironment.name,
        newName: environmentName,
        oldSlug: oldEnvironment.slug,
        newSlug: environmentSlug.toLowerCase()
      }
    },
    {
      workspaceId: workspace._id
    }
  );

  return res.status(200).send({
    message: "Successfully update environment",
    workspace: workspaceId,
    environment: {
      name: environmentName,
      slug: environmentSlug
    }
  });
};

/**
 * Delete workspace environment by [environmentSlug] of workspace [workspaceId] and do the clean up
 * @param req
 * @param res
 * @returns
 */
export const deleteWorkspaceEnvironment = async (req: Request, res: Response) => {
  /*
    #swagger.summary = 'Delete environment'
    #swagger.description = 'Delete environment'

    #swagger.security = [{
        "apiKeyAuth": []
    }]

    #swagger.parameters['workspaceId'] = {
      "description": "ID of workspace where to delete environment",
      "required": true,
      "type": "string",
      "in": "path"
	  }

    #swagger.requestBody = {
        content: {
            "application/json": {
                "schema": {
                    "type": "object",
                    "properties": {
                        "environmentSlug": {
                            "type": "string",
                            "description": "Slug of environment to delete",
                            "example": "dev"
                        }
                    },
                    "required": ["environmentSlug"]
                }
            }
        }
    }

    #swagger.responses[200] = {
        content: {
            "application/json": {
                "schema": {
                    "type": "object",
                    "properties": {
                        "message": {
                            "type": "string",
                            "description": "Success message",
                            "example": "Successfully deleted environment"
                        },
                        "workspace": {
                            "type": "string",
                            "description": "ID of workspace where environment was deleted",
                            "example": "abc123"
                        },
                        "environment": {
                            "type": "string",
                            "description": "Slug of deleted environment",
                            "example": "dev"
                        }
                    },
                    "description": "Response after deleting an environment from a workspace"
                }
            }
        }
    }
*/
  const {
    params: { workspaceId },
    body: { environmentSlug }
  } = await validateRequest(reqValidator.DeleteWorkspaceEnvironmentV2, req);

  const { permission } = await getAuthDataProjectPermissions({
    authData: req.authData,
    workspaceId: new Types.ObjectId(workspaceId)
  });

  ForbiddenError.from(permission).throwUnlessCan(
    ProjectPermissionActions.Delete,
    ProjectPermissionSub.Environments
  );

  // atomic update the env to avoid conflict
  const workspace = await Workspace.findById(workspaceId).exec();
  if (!workspace) {
    throw new Error("Failed to create workspace environment");
  }

  const envIndex = workspace?.environments.findIndex(({ slug }) => slug === environmentSlug);
  if (envIndex === -1) {
    throw new Error("Invalid environment given");
  }

  const oldEnvironment = workspace.environments[envIndex];

  workspace.environments.splice(envIndex, 1);
  await workspace.save();

  // clean up
  await Secret.deleteMany({
    workspace: workspaceId,
    environment: environmentSlug
  });
  await SecretVersion.deleteMany({
    workspace: workspaceId,
    environment: environmentSlug
  });

  // await ServiceToken.deleteMany({
  //   workspace: workspaceId,
  //   environment: environmentSlug,
  // });

  const result = await ServiceTokenData.updateMany(
    { workspace: workspaceId },
    { $pull: { scopes: { environment: environmentSlug } } }
  );

  if (result.modifiedCount > 0) {
    await ServiceTokenData.deleteMany({ workspace: workspaceId, scopes: { $size: 0 } });
  }

  await Integration.deleteMany({
    workspace: workspaceId,
    environment: environmentSlug
  });
  await Membership.updateMany(
    { workspace: workspaceId },
    { $pull: { deniedPermissions: { environmentSlug: environmentSlug } } }
  );

  await EELicenseService.refreshPlan(workspace.organization, new Types.ObjectId(workspaceId));

  await EEAuditLogService.createAuditLog(
    req.authData,
    {
      type: EventType.DELETE_ENVIRONMENT,
      metadata: {
        name: oldEnvironment.name,
        slug: oldEnvironment.slug
      }
    },
    {
      workspaceId: workspace._id
    }
  );

  return res.status(200).send({
    message: "Successfully deleted environment",
    workspace: workspaceId,
    environment: environmentSlug
  });
};