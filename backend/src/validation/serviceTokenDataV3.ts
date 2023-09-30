import { Types } from "mongoose";
import { IServiceTokenDataV3 } from "../models";
import { Permission } from "../models/serviceTokenDataV3";
import { z } from "zod";
import { UnauthorizedRequestError } from "../utils/errors";
import { isValidScopeV3 } from "../helpers";
import { AuthData } from "../interfaces/middleware";
import { checkIPAgainstBlocklist } from "../utils/ip";

/**
 * Validate that service token (client) can access workspace
 * with id [workspaceId] and its environment [environment] with required permissions
 * [requiredPermissions]
 * @param {Object} obj
 * @param {ServiceTokenData} obj.serviceTokenData - service token client
 * @param {Types.ObjectId} obj.workspaceId - id of workspace to validate against
 * @param {String} environment - (optional) environment in workspace to validate against
 * @param {String[]} acceptedPermissions - accepted permissions as part of the endpoint
 */
 export const validateServiceTokenDataV3ClientForWorkspace = async ({
  authData,
  serviceTokenData,
  workspaceId,
  environment,
  secretPath = "/",
  requiredPermissions
}: {
  authData: AuthData;
  serviceTokenData: IServiceTokenDataV3;
  workspaceId: Types.ObjectId;
  environment?: string;
  secretPath?: string;
  requiredPermissions: Permission[];
}) => {
  
  // validate ST V3 IP address
  checkIPAgainstBlocklist({
    ipAddress: authData.ipAddress,
    trustedIps: serviceTokenData.trustedIps
  });
  
  if (!serviceTokenData.workspace.equals(workspaceId)) {
    // case: invalid workspaceId passed
    throw UnauthorizedRequestError({
      message: "Failed service token authorization for the given workspace"
    });
  }
  
  if (environment) {
    const isValid = isValidScopeV3({
      authPayload: serviceTokenData,
      environment,
      secretPath,
      requiredPermissions
    });
    
    if (!isValid) throw UnauthorizedRequestError({
      message: "Failed service token authorization for the given workspace"
    });
  }
};

export const CreateServiceTokenV3 = z.object({
  body: z.object({
    name: z.string().trim(),
    workspaceId: z.string().trim(),
    publicKey: z.string().trim(),
    scopes: z
      .object({
        permissions: z.enum(["read", "write"]).array(),
        environment: z.string().trim(),
        secretPath: z.string().trim()
      })
      .array()
      .min(1),
    trustedIps: z
      .object({
        ipAddress: z.string().trim(),
      })
      .array()
      .min(1),
    expiresIn: z.number().optional(),
    encryptedKey: z.string().trim(),
    nonce: z.string().trim()
  })
});
  
export const UpdateServiceTokenV3 = z.object({
  params: z.object({
    serviceTokenDataId: z.string()
  }),
  body: z.object({
    name: z.string().trim().optional(),
    isActive: z.boolean().optional(),
    scopes: z
      .object({
        permissions: z.enum(["read", "write"]).array(),
        environment: z.string().trim(),
        secretPath: z.string().trim()
      })
      .array()
      .min(1)
      .optional(),
    trustedIps: z
      .object({
        ipAddress: z.string().trim()
      })
      .array()
      .min(1)
      .optional(),
    expiresIn: z.number().optional()
  }),
});

export const DeleteServiceTokenV3 = z.object({
  params: z.object({
    serviceTokenDataId: z.string()
  }),
});