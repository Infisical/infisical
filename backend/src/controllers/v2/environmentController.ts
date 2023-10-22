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
import _ from "lodash";
import { PERMISSION_READ_SECRETS, PERMISSION_WRITE_SECRETS } from "../../variables";
import { validateRequest } from "../../helpers/validation";
import * as reqValidator from "../../validation/environments";
import {
  ProjectPermissionActions,
  ProjectPermissionSub,
  getUserProjectPermissions
} from "../../ee/services/ProjectRoleService";
import { ForbiddenError } from "@casl/ability";
import { SecretImport } from "../../models";
import { ServiceAccountWorkspacePermission } from "../../models";
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
        "apiKeyAuth": []
    }]

	#swagger.parameters['workspaceId'] = {
		"description": "ID of project",
		"required": true,
		"type": "string"
	}

  /*
    #swagger.summary = 'Create environment'
    #swagger.description = 'Create environment'

    #swagger.security = [{
        "apiKeyAuth": []
    }]

	#swagger.parameters['workspaceId'] = {
		"description": "ID of project",
		"required": true,
		"type": "string"
	}

  #swagger.requestBody = {
      content: {
          "application/json": {
              "schema": {
                  "type": "object",
                  "properties": {
                      "environmentName": {
                          "type": "string",
                          "description": "Name of the environment",
                          "example": "development"
                      },
                      "environmentSlug": {
                          "type": "string",
                          "description": "Slug of the environment",
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
                          "example": "Successfully created new environment"
                      },
                      "workspace": {
                          "type": "string",
                          "example": "someWorkspaceId"
                      },
                      "environment": {
                          "type": "object",
                          "properties": {
                              "name": {
                                  "type": "string",
                                  "example": "someEnvironmentName"
                              },
                              "slug": {
                                  "type": "string",
                                  "example": "someEnvironmentSlug"
                              }
                          }
                      }
                  },
                  "description": "Response after creating a new environment"
              }
          }
      }
  }
  */
  const {
    params: { workspaceId },
    body: { environmentName, environmentSlug }
  } = await validateRequest(reqValidator.CreateWorkspaceEnvironmentV2, req);

  const { permission } = await getUserProjectPermissions(req.user._id, workspaceId);
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

  const { permission } = await getUserProjectPermissions(req.user._id, workspaceId);
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
    #swagger.summary = 'Rename workspace environment'
    #swagger.description = 'Rename a specific environment within a workspace'

    #swagger.parameters['workspaceId'] = {
    "description": "ID of the workspace",
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
                            "description": "New name for the environment",
                            "example": "Staging-Renamed"
                        },
                        "environmentSlug": {
                            "type": "string",
                            "description": "New slug for the environment",
                            "example": "staging-renamed"
                        },
                        "oldEnvironmentSlug": {
                            "type": "string",
                            "description": "Current slug of the environment to rename",
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
                            "example": "Successfully update environment"
                        },
                        "workspace": {
                            "type": "string",
                            "example": "someWorkspaceId"
                        },
                        "environment": {
                            "type": "object",
                            "properties": {
                                "name": {
                                    "type": "string",
                                    "example": "Staging-Renamed"
                                },
                                "slug": {
                                    "type": "string",
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

  const { permission } = await getUserProjectPermissions(req.user._id, workspaceId);
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

  await ServiceAccountWorkspacePermission.updateMany(
    { workspace: workspaceId, environment: oldEnvironmentSlug },
    { environment: environmentSlug }
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
    #swagger.summary = 'Delete workspace environment'
    #swagger.description = 'Delete a specific environment from a workspace'

    #swagger.security = [{
        "apiKeyAuth": []
    }]

    #swagger.parameters['workspaceId'] = {
		"description": "ID of the workspace",
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
                            "description": "Slug of the environment to delete",
                            "example": "dev-environment"
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
                            "example": "Successfully deleted environment"
                        },
                        "workspace": {
                            "type": "string",
                            "example": "someWorkspaceId"
                        },
                        "environment": {
                            "type": "string",
                            "example": "dev-environment"
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

  const { permission } = await getUserProjectPermissions(req.user._id, workspaceId);
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

// TODO(akhilmhdh) after rbac this can be completely removed
export const getAllAccessibleEnvironmentsOfWorkspace = async (req: Request, res: Response) => {
  /*
    #swagger.summary = 'Get all accessible environments of a workspace'
    #swagger.description = 'Fetch all environments that the user has access to in a specified workspace'

    #swagger.security = [{
        "apiKeyAuth": []
    }]

    #swagger.parameters['workspaceId'] = {
		"description": "ID of the workspace",
		"required": true,
		"type": "string",
        "in": "path"
	}

    #swagger.responses[200] = {
        content: {
            "application/json": {
                "schema": {
                    "type": "object",
                    "properties": {
                        "accessibleEnvironments": {
                            "type": "array",
                            "items": {
                                "type": "object",
                                "properties": {
                                    "name": {
                                        "type": "string",
                                        "example": "Development"
                                    },
                                    "slug": {
                                        "type": "string",
                                        "example": "development"
                                    },
                                    "isWriteDenied": {
                                        "type": "boolean",
                                        "example": false
                                    },
                                    "isReadDenied": {
                                        "type": "boolean",
                                        "example": false
                                    }
                                }
                            }
                        }
                    },
                    "description": "List of environments the user has access to in the specified workspace"
                }
            }
        }
    }
  */
  const {
    params: { workspaceId }
  } = await validateRequest(reqValidator.GetAllAccessibileEnvironmentsOfWorkspaceV2, req);

  const { membership: workspacesUserIsMemberOf } = await getUserProjectPermissions(
    req.user._id,
    workspaceId
  );

  const accessibleEnvironments: any = [];
  const deniedPermission = workspacesUserIsMemberOf.deniedPermissions;

  const relatedWorkspace = await Workspace.findById(workspaceId);
  if (!relatedWorkspace) {
    throw BadRequestError();
  }
  relatedWorkspace.environments.forEach((environment) => {
    const isReadBlocked = _.some(deniedPermission, {
      environmentSlug: environment.slug,
      ability: PERMISSION_READ_SECRETS
    });
    const isWriteBlocked = _.some(deniedPermission, {
      environmentSlug: environment.slug,
      ability: PERMISSION_WRITE_SECRETS
    });
    if (isReadBlocked && isWriteBlocked) {
      return;
    } else {
      accessibleEnvironments.push({
        name: environment.name,
        slug: environment.slug,
        isWriteDenied: isWriteBlocked,
        isReadDenied: isReadBlocked
      });
    }
  });

  res.json({ accessibleEnvironments });
};
