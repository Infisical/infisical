import { Request, Response } from 'express';
import * as Sentry from '@sentry/node';
import crypto from 'crypto';
import bcrypt from 'bcrypt';
import {
    ServiceTokenData
} from '../../models';
import {
    SALT_ROUNDS
} from '../../config';

/**
 * Return service token data associated with service token on request
 * @param req 
 * @param res 
 * @returns 
 */
export const getServiceTokenData = async (req: Request, res: Response) => ({
    serviceTokenData: req.serviceTokenData
});

/**
 * Create new service token data for workspace with id [workspaceId] and
 * environment [environment].
 * @param req 
 * @param res 
 * @returns 
 */
export const createServiceTokenData = async (req: Request, res: Response) => {
    let serviceToken, serviceTokenData;
    try {
        const { 
            name,
            workspaceId, 
            environment,
            encryptedKey,
            iv,
            tag,
            expiresIn
        } = req.body;
        
        // create 41-char service token with first 9-char being the prefix
        serviceToken = `st.${crypto.randomBytes(19).toString('hex')}`;

        const serviceTokenHash = await bcrypt.hash(serviceToken, SALT_ROUNDS);

        // compute access token expiration date
		const expiresAt = new Date();
		expiresAt.setSeconds(expiresAt.getSeconds() + expiresIn);
        
        // create service token data
        serviceTokenData = new ServiceTokenData({
            name,
            workspace: workspaceId,
            environment,
            user: req.user._id,
            expiresAt,
            prefix: serviceToken.substring(0, 9),
            serviceTokenHash,
            encryptedKey,
            iv,
            tag
        })
        
        await serviceTokenData.save();

        // return service token data without sensitive data
        serviceTokenData = await ServiceTokenData.findById(serviceTokenData._id);
        
    } catch (err) {
        Sentry.setUser({ email: req.user.email });
        Sentry.captureException(err);
        return res.status(400).send({
            message: 'Failed to create service token data'
        });
    }

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
    let serviceTokenData;
    try {
        const { serviceTokenDataId } = req.params;

        serviceTokenData = await ServiceTokenData.findByIdAndDelete(serviceTokenDataId);
        
    } catch (err) {
        Sentry.setUser({ email: req.user.email });
        Sentry.captureException(err);
        return res.status(400).send({
            message: 'Failed to delete service token data'
        });
    }
    
    return res.status(200).send({
        serviceTokenData
    });
}