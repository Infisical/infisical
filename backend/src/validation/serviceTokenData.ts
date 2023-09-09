import { Types } from "mongoose";
import { ISecret, IServiceTokenData, IUser, ServiceTokenData } from "../models";
import { ServiceTokenDataNotFoundError, UnauthorizedRequestError } from "../utils/errors";
import { validateUserClientForWorkspace } from "./user";
import { ActorType } from "../ee/models";
import { AuthData } from "../interfaces/middleware";
import { z } from "zod";
import { isValidScope } from "../helpers";

/**
 * Validate authenticated clients for service token with id [serviceTokenId] based
 * on any known permissions.
 * @param {Object} obj
 * @param {Object} obj.authData - authenticated client details
 * @param {Types.ObjectId} obj.serviceTokenData - id of service token to validate against
 * @param {Array<'admin' | 'member'>} obj.acceptedRoles - accepted workspace roles
 */
export const validateClientForServiceTokenData = async ({
  authData,
  serviceTokenDataId,
  acceptedRoles
}: {
  authData: AuthData;
  serviceTokenDataId: Types.ObjectId;
  acceptedRoles: Array<"admin" | "member">;
}) => {
  const serviceTokenData = await ServiceTokenData.findById(serviceTokenDataId)
    .select("+encryptedKey +iv +tag")
    .populate<{ user: IUser }>("user");

  if (!serviceTokenData)
    throw ServiceTokenDataNotFoundError({
      message: "Failed to find service token data"
    });

  switch (authData.actor.type) {
    case ActorType.USER:
      await validateUserClientForWorkspace({
        user: authData.authPayload as IUser,
        workspaceId: serviceTokenData.workspace,
        acceptedRoles
      });

      return serviceTokenData;
    case ActorType.SERVICE:
      throw UnauthorizedRequestError({
        message: "Failed service token authorization for service token data"
      });
  }
};

/**
 * Validate that service token (client) can access workspace
 * with id [workspaceId] and its environment [environment] with required permissions
 * [requiredPermissions]
 * @param {Object} obj
 * @param {ServiceTokenData} obj.serviceTokenData - service token client
 * @param {Types.ObjectId} obj.workspaceId - id of workspace to validate against
 * @param {String} environment - (optional) environment in workspace to validate against
 * @param {String[]} requiredPermissions - required permissions as part of the endpoint
 */
export const validateServiceTokenDataClientForWorkspace = async ({
  serviceTokenData,
  workspaceId,
  environment,
  secretPath = "/",
  requiredPermissions
}: {
  serviceTokenData: IServiceTokenData;
  workspaceId: Types.ObjectId;
  environment?: string;
  secretPath?: string;
  requiredPermissions?: string[];
}) => {
  if (!serviceTokenData.workspace.equals(workspaceId)) {
    // case: invalid workspaceId passed
    throw UnauthorizedRequestError({
      message: "Failed service token authorization for the given workspace"
    });
  }

  if (environment) {
    // case: environment is specified
    if (!serviceTokenData.scopes.find(({ environment: tkEnv }) => tkEnv === environment)) {
      // case: invalid environment passed
      throw UnauthorizedRequestError({
        message: "Failed service token authorization for the given workspace environment"
      });
    }

    if (!isValidScope(serviceTokenData, environment, secretPath)) {
      throw UnauthorizedRequestError({ message: "Folder Permission Denied" });
    }

    requiredPermissions?.forEach((permission) => {
      if (!serviceTokenData.permissions.includes(permission)) {
        throw UnauthorizedRequestError({
          message: `Failed service token authorization for the given workspace environment action: ${permission}`
        });
      }
    });
  }
};

/**
 * Validate that service token (client) can access secrets
 * with required permissions [requiredPermissions]
 * @param {Object} obj
 * @param {ServiceTokenData} obj.serviceTokenData - service token client
 * @param {Secret[]} secrets - secrets to validate against
 * @param {string[]} requiredPermissions - required permissions as part of the endpoint
 */
export const validateServiceTokenDataClientForSecrets = async ({
  serviceTokenData,
  secrets,
  requiredPermissions
}: {
  serviceTokenData: IServiceTokenData;
  secrets: ISecret[];
  requiredPermissions?: string[];
}) => {
  secrets.forEach((secret: ISecret) => {
    if (!serviceTokenData.workspace.equals(secret.workspace)) {
      // case: invalid workspaceId passed
      throw UnauthorizedRequestError({
        message: "Failed service token authorization for the given workspace"
      });
    }

    if (!serviceTokenData.scopes.find(({ environment: tkEnv }) => tkEnv === secret.environment)) {
      // case: invalid environment passed
      throw UnauthorizedRequestError({
        message: "Failed service token authorization for the given workspace environment"
      });
    }

    requiredPermissions?.forEach((permission) => {
      if (!serviceTokenData.permissions.includes(permission)) {
        throw UnauthorizedRequestError({
          message: `Failed service token authorization for the given workspace environment action: ${permission}`
        });
      }
    });
  });
};

export const CreateServiceTokenV2 = z.object({
  body: z.object({
    name: z.string().trim(),
    workspaceId: z.string().trim(),
    scopes: z
      .object({
        environment: z.string().trim(),
        secretPath: z.string().trim()
      })
      .array()
      .min(1),
    encryptedKey: z.string().trim(),
    iv: z.string().trim(),
    tag: z.string().trim(),
    expiresIn: z.number(),
    permissions: z.enum(["read", "write"]).array()
  })
});

export const DeleteServiceTokenV2 = z.object({
  params: z.object({
    serviceTokenDataId: z.string().trim()
  })
});
