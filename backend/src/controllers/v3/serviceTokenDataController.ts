import { Request, Response } from "express";
import { Types } from "mongoose";
import { 
    IServiceTokenDataV3,
    IUser,
    ServiceTokenDataV3,
    ServiceTokenDataV3Key
} from "../../models";
import {
    Scope
} from "../../models/serviceTokenDataV3";
import {
    ActorType,
    EventType
} from "../../ee/models";
import { validateRequest } from "../../helpers/validation";
import * as reqValidator from "../../validation/serviceTokenDataV3";
import { createToken } from "../../helpers/auth";
import {
  ProjectPermissionActions,
  ProjectPermissionSub,
  getUserProjectPermissions
} from "../../ee/services/ProjectRoleService";
import { ForbiddenError } from "@casl/ability"; 
import { BadRequestError, ResourceNotFoundError } from "../../utils/errors";
import { EEAuditLogService } from "../../ee/services";
import { getJwtServiceTokenSecret } from "../../config";

/**
 * Return project key for service token
 * @param req 
 * @param res 
 */
export const getServiceTokenDataKey = async (req: Request, res: Response) => {
    const key = await ServiceTokenDataV3Key.findOne({
        serviceTokenData: (req.authData.authPayload as IServiceTokenDataV3)._id
    }).populate<{ sender: IUser }>("sender", "publicKey");
    
    if (!key) throw ResourceNotFoundError({
        message: "Failed to find project key for service token"
    });
    
    const { _id, workspace, encryptedKey, nonce, sender: { publicKey } } = key;
    
    return res.status(200).send({
        key: {
            _id,
            workspace,
            encryptedKey,
            publicKey,
            nonce
        }
    });
}

/**
 * Create service token data
 * @param req 
 * @param res 
 * @returns 
 */
export const createServiceTokenData = async (req: Request, res: Response) => {
    const {
        body: { 
            name, 
            workspaceId, 
            publicKey, 
            scopes,
            expiresIn, 
            encryptedKey, // for ServiceTokenDataV3Key
            nonce // for ServiceTokenDataV3Key
        }
    } = await validateRequest(reqValidator.CreateServiceTokenV3, req);
    const { permission } = await getUserProjectPermissions(req.user._id, workspaceId);
    ForbiddenError.from(permission).throwUnlessCan(
        ProjectPermissionActions.Create,
        ProjectPermissionSub.ServiceTokens
    );
    
    let expiresAt;
    if (expiresIn) {
        expiresAt = new Date();
        expiresAt.setSeconds(expiresAt.getSeconds() + expiresIn);
    }
    
    let user;
    if (req.authData.actor.type === ActorType.USER) {
        user = req.authData.authPayload._id;
    }
    
    const isActive = false;
    const serviceTokenData = await new ServiceTokenDataV3({
        name,
        user,
        workspace: new Types.ObjectId(workspaceId),
        publicKey,
        usageCount: 0,
        scopes,
        isActive,
        expiresAt
    }).save();
    
    await new ServiceTokenDataV3Key({
        encryptedKey,
        nonce,
        sender: req.user._id,
        serviceTokenData: serviceTokenData._id,
        workspace: new Types.ObjectId(workspaceId)
    }).save();
    
    const token = createToken({
        payload: {
            _id: serviceTokenData._id.toString()
        },
        expiresIn,
        secret: await getJwtServiceTokenSecret()
    });
    
    await EEAuditLogService.createAuditLog(
        req.authData,
        {
            type: EventType.CREATE_SERVICE_TOKEN_V3,
            metadata: {
                name,
                isActive,
                scopes: scopes as Array<Scope>,
                expiresAt
            }
        },
        {
            workspaceId: new Types.ObjectId(workspaceId)
        }
    );
    
    return res.status(200).send({
        serviceTokenData,
        serviceToken: `proj_token.${token}`
    });
}

/**
 * Update service token data with id [serviceTokenDataId]
 * @param req 
 * @param res 
 * @returns 
 */
export const updateServiceTokenData = async (req: Request, res: Response) => {
    const {
        params: { serviceTokenDataId },
        body: { 
            name, 
            isActive,
            scopes,
            expiresIn
        }
    } = await validateRequest(reqValidator.UpdateServiceTokenV3, req);

    let serviceTokenData = await ServiceTokenDataV3.findById(serviceTokenDataId);

    if (!serviceTokenData) throw ResourceNotFoundError({ 
        message: "Service token not found" 
    });
    
    const { permission } = await getUserProjectPermissions(
        req.user._id,
        serviceTokenData.workspace.toString()
    );
    
    ForbiddenError.from(permission).throwUnlessCan(
        ProjectPermissionActions.Edit,
        ProjectPermissionSub.ServiceTokens
    );

    let expiresAt;
    if (expiresIn) {
        expiresAt = new Date();
        expiresAt.setSeconds(expiresAt.getSeconds() + expiresIn);
    }
    
    serviceTokenData = await ServiceTokenDataV3.findByIdAndUpdate(
        serviceTokenDataId,
        {
            name,
            isActive,
            scopes,
            expiresAt
        },
        {
            new: true
        }
    );
    
    if (!serviceTokenData) throw BadRequestError({
        message: "Failed to update service token"
    });

    await EEAuditLogService.createAuditLog(
        req.authData,
        {
            type: EventType.UPDATE_SERVICE_TOKEN_V3,
            metadata: {
                name: serviceTokenData.name,
                isActive,
                scopes: scopes as Array<Scope>,
                expiresAt
            }
        },
        {
            workspaceId: serviceTokenData.workspace
        }
    );

    return res.status(200).send({
        serviceTokenData
    }); 
}

/**
 * Delete service token data with id [serviceTokenDataId]
 * @param req 
 * @param res 
 * @returns 
 */
export const deleteServiceTokenData = async (req: Request, res: Response) => {
    const {
        params: { serviceTokenDataId }
    } = await validateRequest(reqValidator.DeleteServiceTokenV3, req);
    
    let serviceTokenData = await ServiceTokenDataV3.findById(serviceTokenDataId);
    if (!serviceTokenData) throw ResourceNotFoundError({ 
        message: "Service token not found" 
    });
    
    const { permission } = await getUserProjectPermissions(
        req.user._id,
        serviceTokenData.workspace.toString()
    );
    
    ForbiddenError.from(permission).throwUnlessCan(
        ProjectPermissionActions.Delete,
        ProjectPermissionSub.ServiceTokens
    );
    
    serviceTokenData = await ServiceTokenDataV3.findByIdAndDelete(serviceTokenDataId);
    
    if (!serviceTokenData) throw BadRequestError({
        message: "Failed to delete service token"
    });
    
    await EEAuditLogService.createAuditLog(
        req.authData,
        {
            type: EventType.DELETE_SERVICE_TOKEN_V3,
            metadata: {
                name: serviceTokenData.name,
                isActive: serviceTokenData.isActive,
                scopes: serviceTokenData.scopes as Array<Scope>,
                expiresAt: serviceTokenData.expiresAt
            }
        },
        {
            workspaceId: serviceTokenData.workspace
        }
    );

    return res.status(200).send({
        serviceTokenData
    }); 
}