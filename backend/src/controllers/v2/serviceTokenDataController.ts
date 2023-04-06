import * as Sentry from '@sentry/node';
import { Request, Response } from 'express';
import crypto from 'crypto';
import bcrypt from 'bcrypt';
import {
    User,
    ServiceAccount,
    ServiceTokenData
} from '../../models';
import { userHasWorkspaceAccess } from '../../ee/helpers/checkMembershipPermissions';
import { 
    PERMISSION_READ_SECRETS,
    AUTH_MODE_JWT,
    AUTH_MODE_SERVICE_ACCOUNT
} from '../../variables';
import { getSaltRounds } from '../../config';

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

    return res.status(200).json(req.serviceTokenData);
}

/**
 * Create new service token data for workspace with id [workspaceId] and
 * environment [environment].
 * @param req 
 * @param res 
 * @returns 
 */
export const createServiceTokenData = async (req: Request, res: Response) => {
    let serviceTokenData;

    const {
        name,
        workspaceId,
        environment,
        encryptedKey,
        iv,
        tag,
        expiresIn,
        permissions
    } = req.body;

    const secret = crypto.randomBytes(16).toString('hex');
    const secretHash = await bcrypt.hash(secret, getSaltRounds());

    const expiresAt = new Date();
    expiresAt.setSeconds(expiresAt.getSeconds() + expiresIn);

    let user, serviceAccount;
    
    if (req.authData.authMode === AUTH_MODE_JWT && req.authData.authPayload instanceof User) {
        user = req.authData.authPayload._id;
    }

    if (req.authData.authMode === AUTH_MODE_SERVICE_ACCOUNT && req.authData.authPayload instanceof ServiceAccount) {
        serviceAccount = req.authData.authPayload._id;
    }
        
    serviceTokenData = await new ServiceTokenData({
        name,
        workspace: workspaceId,
        environment,
        user,
        serviceAccount,
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

    if (!serviceTokenData) throw new Error('Failed to find service token data');

    const serviceToken = `st.${serviceTokenData._id.toString()}.${secret}`;

    return res.status(200).send({
        serviceToken,
        serviceTokenData
    });
}

/**
 * Delete service token data with id [serviceTokenDataId].
 * @param req 
 * @param res 
 * @returns 
 */
export const deleteServiceTokenData = async (req: Request, res: Response) => {
    const { serviceTokenDataId } = req.params;

    const serviceTokenData = await ServiceTokenData.findByIdAndDelete(serviceTokenDataId);

    return res.status(200).send({
        serviceTokenData
    });
}