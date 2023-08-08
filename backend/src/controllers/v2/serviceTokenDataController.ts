import { Request, Response } from "express";
import crypto from "crypto";
import bcrypt from "bcrypt";
import { ServiceTokenData } from "../../models";
import { getSaltRounds } from "../../config";
import { BadRequestError } from "../../utils/errors";
import { ActorType, EventType } from "../../ee/models";
import { EEAuditLogService } from "../../ee/services";

/**
 * Return service token data associated with service token on request
 * @param req
 * @param res
 * @returns
 */
export const getServiceTokenData = async (req: Request, res: Response) => {
  /* 
    #swagger.summary = 'Return Infisical Token data'
    #swagger.description = 'Return Infisical Token data'
    
    #swagger.security = [{
        "bearerAuth": []
    }]

    #swagger.responses[200] = {
        content: {
            "application/json": {
                "schema": { 
                    "type": "object",
          "properties": {
                        "serviceTokenData": {
                            "type": "object",
                            $ref: "#/components/schemas/ServiceTokenData",
                            "description": "Details of service token"
                        }
          }
                }
            }           
        }
    }   
    */

  if (!(req.authData.authPayload instanceof ServiceTokenData))
    throw BadRequestError({
      message: "Failed accepted client validation for service token data"
    });

  const serviceTokenData = await ServiceTokenData.findById(req.authData.authPayload._id)
    .select("+encryptedKey +iv +tag")
    .populate("user")
    .lean();

  return res.status(200).json(serviceTokenData);
};

/**
 * Create new service token data for workspace with id [workspaceId] and
 * environment [environment].
 * @param req
 * @param res
 * @returns
 */
export const createServiceTokenData = async (req: Request, res: Response) => {
  let serviceTokenData;

  const { name, workspaceId, encryptedKey, iv, tag, expiresIn, permissions, scopes } = req.body;

  const secret = crypto.randomBytes(16).toString("hex");
  const secretHash = await bcrypt.hash(secret, await getSaltRounds());

  let expiresAt;
  if (expiresIn) {
    expiresAt = new Date();
    expiresAt.setSeconds(expiresAt.getSeconds() + expiresIn);
  }

  let user;
  
  if (req.authData.actor.type === ActorType.USER) {
    user = req.authData.authPayload._id;
  }

  serviceTokenData = await new ServiceTokenData({
    name,
    workspace: workspaceId,
    user,
    scopes,
    lastUsed: new Date(),
    expiresAt,
    secretHash,
    encryptedKey,
    iv,
    tag,
    permissions
  }).save();

  // return service token data without sensitive data
  serviceTokenData = await ServiceTokenData.findById(serviceTokenData._id);

  if (!serviceTokenData) throw new Error("Failed to find service token data");

  const serviceToken = `st.${serviceTokenData._id.toString()}.${secret}`;
  
  await EEAuditLogService.createAuditLog(
    req.authData,
    {
      type: EventType.CREATE_SERVICE_TOKEN,
      metadata: {
        name,
        scopes
      }
    },
    {
      workspaceId
    }
  );

  return res.status(200).send({
    serviceToken,
    serviceTokenData
  });
};

/**
 * Delete service token data with id [serviceTokenDataId].
 * @param req
 * @param res
 * @returns
 */
export const deleteServiceTokenData = async (req: Request, res: Response) => {
  const { serviceTokenDataId } = req.params;

  const serviceTokenData = await ServiceTokenData.findByIdAndDelete(serviceTokenDataId);
  
  if (!serviceTokenData) return res.status(200).send({
    message: "Failed to delete service token"
  });
  
  await EEAuditLogService.createAuditLog(
    req.authData,
    {
      type: EventType.DELETE_SERVICE_TOKEN,
      metadata: {
        name: serviceTokenData.name,
        scopes: serviceTokenData?.scopes
      }
    },
    {
      workspaceId: serviceTokenData.workspace
    }
  );

  return res.status(200).send({
    serviceTokenData
  });
};
