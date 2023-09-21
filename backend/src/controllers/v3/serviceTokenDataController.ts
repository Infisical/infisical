import { Request, Response } from "express";
import { Types } from "mongoose";
import { 
    ServiceTokenDataV3,
    ServiceTokenDataV3Key
} from "../../models";
import { validateRequest } from "../../helpers/validation";
import * as reqValidator from "../../validation/serviceTokenV3";
import { createToken } from "../../helpers/auth";

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
    
    let expiresAt;
    if (expiresIn) {
        expiresAt = new Date();
        expiresAt.setSeconds(expiresAt.getSeconds() + expiresIn);
    }
    
    const serviceTokenData = await new ServiceTokenDataV3({
        name,
        workspace: new Types.ObjectId(workspaceId),
        publicKey,
        scopes,
        isActive: false,
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
        secret: "hello" // TODO: replace with real secret
    });
    
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

    let expiresAt;
    if (expiresIn) {
        expiresAt = new Date();
        expiresAt.setSeconds(expiresAt.getSeconds() + expiresIn);
    }
    
    const serviceTokenData = await ServiceTokenDataV3.findByIdAndUpdate(
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
    
    const serviceTokenData = await ServiceTokenDataV3.findByIdAndDelete(serviceTokenDataId);
    
    if (serviceTokenData) {
        await ServiceTokenDataV3Key.findOneAndDelete({
            serviceTokenData: serviceTokenData._id
        });
    }

    return res.status(200).send({
        serviceTokenData
    }); 
}