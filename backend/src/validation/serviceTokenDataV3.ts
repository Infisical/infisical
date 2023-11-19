import { Types } from "mongoose";
import { IServiceTokenDataV3 } from "../models";
import { z } from "zod";
import { UnauthorizedRequestError } from "../utils/errors";
import { AuthData } from "../interfaces/middleware";
import { checkIPAgainstBlocklist } from "../utils/ip";
import { MEMBER } from "../variables";

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
  // secretPath = "/",
}: {
  authData: AuthData;
  serviceTokenData: IServiceTokenDataV3;
  workspaceId: Types.ObjectId;
  environment?: string;
  // secretPath?: string;
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
    
    // TODO: validation fun for ST V3
    
    // const isValid = isValidScopeV3({
    //   authPayload: serviceTokenData,
    //   environment,
    //   secretPath,
    //   requiredPermissions
    // });
    
    // if (!isValid) throw UnauthorizedRequestError({
    //   message: "Failed service token authorization for the given workspace"
    // });
  }
};

export const RefreshTokenV3 = z.object({
  body: z.object({
    refresh_token: z.string().trim()
  })
});

export const CreateServiceTokenV3 = z.object({
  body: z.object({
    name: z.string().trim(),
    workspaceId: z.string().trim(),
    publicKey: z.string().trim(),
    role: z.string().trim().min(1).default(MEMBER),
    trustedIps: z // TODO: provide default
      .object({
        ipAddress: z.string().trim(),
      })
      .array()
      .min(1)
      .default([{ ipAddress: "0.0.0.0/0" }]),
    expiresIn: z.number().optional(),
    accessTokenTTL: z.number().int().min(1),
    encryptedKey: z.string().trim(),
    nonce: z.string().trim(),
    isRefreshTokenRotationEnabled: z.boolean().default(false)
  })
});
  
export const UpdateServiceTokenV3 = z.object({
  params: z.object({
    serviceTokenDataId: z.string()
  }),
  body: z.object({
    name: z.string().trim().optional(),
    isActive: z.boolean().optional(),
    role: z.string().trim().min(1).optional(),
    trustedIps: z
      .object({
        ipAddress: z.string().trim()
      })
      .array()
      .min(1)
      .optional(),
    expiresIn: z.number().optional(),
    accessTokenTTL: z.number().int().min(1).optional(),
    isRefreshTokenRotationEnabled: z.boolean().optional()
  }),
});

export const DeleteServiceTokenV3 = z.object({
  params: z.object({
    serviceTokenDataId: z.string()
  }),
});