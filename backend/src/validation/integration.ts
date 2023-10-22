import { Types } from "mongoose";
import { IUser, Integration, IntegrationAuth } from "../models";
import { validateUserClientForWorkspace } from "./user";
import { IntegrationService } from "../services";
import {
  IntegrationAuthNotFoundError,
  IntegrationNotFoundError,
  UnauthorizedRequestError
} from "../utils/errors";
import { AuthData } from "../interfaces/middleware";
import { ActorType } from "../ee/models";
import { z } from "zod";

/**
 * Validate authenticated clients for integration with id [integrationId] based
 * on any known permissions.
 * @param {Object} obj
 * @param {Object} obj.authData - authenticated client details
 * @param {Types.ObjectId} obj.integrationId - id of integration to validate against
 * @param {String} obj.environment - (optional) environment in workspace to validate against
 * @param {Array<'admin' | 'member'>} obj.acceptedRoles - accepted workspace roles
 * @param {String[]} obj.requiredPermissions - required permissions as part of the endpoint
 */
export const validateClientForIntegration = async ({
  authData,
  integrationId,
  acceptedRoles
}: {
  authData: AuthData;
  integrationId: Types.ObjectId;
  acceptedRoles: Array<"admin" | "member">;
}) => {
  const integration = await Integration.findById(integrationId);
  if (!integration) throw IntegrationNotFoundError();

  const integrationAuth = await IntegrationAuth.findById(integration.integrationAuth).select(
    "+refreshCiphertext +refreshIV +refreshTag +accessCiphertext +accessIV +accessTag +accessExpiresAt metadata"
  );
  
  if (!integrationAuth) throw IntegrationAuthNotFoundError();

  const accessToken = (
    await IntegrationService.getIntegrationAuthAccess({
      integrationAuthId: integrationAuth._id
    })
  ).accessToken;

  switch (authData.actor.type) {
    case ActorType.USER:
      await validateUserClientForWorkspace({
        user: authData.authPayload as IUser,
        workspaceId: integration.workspace,
        acceptedRoles
      });

      return { integration, accessToken };
    case ActorType.SERVICE:
      throw UnauthorizedRequestError({
        message: "Failed service token authorization for integration"
      });
    case ActorType.SERVICE_V3:
      throw UnauthorizedRequestError({
        message: "Failed service token authorization for integration"
      });
  }
};

export const CreateIntegrationV1 = z.object({
  body: z.object({
    integrationAuthId: z.string().trim(),
    app: z.string().trim().optional(),
    isActive: z.boolean(),
    appId: z.string().trim().optional(),
    secretPath: z.string().trim().default("/"),
    sourceEnvironment: z.string().trim(),
    targetEnvironment: z.string().trim().optional(),
    targetEnvironmentId: z.string().trim().optional(),
    targetService: z.string().trim().optional(),
    targetServiceId: z.string().trim().optional(),
    owner: z.string().trim().optional(),
    path: z.string().trim().optional(),
    region: z.string().trim().optional(),
    scope: z.string().trim().optional(),
    metadata: z.object({
      secretPrefix: z.string().optional(),
      secretSuffix: z.string().optional(),
      secretGCPLabel: z.object({
        labelName: z.string(),
        labelValue: z.string()
      }).optional(),
    }).optional()
  })
});

export const UpdateIntegrationV1 = z.object({
  params: z.object({
    integrationId: z.string().trim()
  }),
  body: z.object({
    app: z.string().trim(),
    appId: z.string().trim(),
    isActive: z.boolean(),
    secretPath: z.string().trim().default("/"),
    targetEnvironment: z.string().trim(),
    owner: z.string().trim(),
    environment: z.string().trim()
  })
});

export const DeleteIntegrationV1 = z.object({
  params: z.object({
    integrationId: z.string().trim()
  })
});

export const ManualSyncV1 = z.object({
  body: z.object({
    environment: z.string().trim(),
    workspaceId: z.string().trim()
  })
});
