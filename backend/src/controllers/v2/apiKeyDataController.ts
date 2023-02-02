import { Request, Response } from 'express';
import * as Sentry from '@sentry/node';
import crypto from 'crypto';
import bcrypt from 'bcrypt';
import {
    APIKeyData
} from '../../models';
import {
    SALT_ROUNDS
} from '../../config';

/**
 * Return API key data for user with id [req.user_id]
 * @param req
 * @param res 
 * @returns 
 */
export const getAPIKeyData = async (req: Request, res: Response) => {
    let apiKeyData;
    try {
        apiKeyData = await APIKeyData.find({
            user: req.user._id
        });
    } catch (err) {
        Sentry.setUser({ email: req.user.email });
        Sentry.captureException(err);
        return res.status(400).send({
            message: 'Failed to get API key data'
        });
    }
    
    return res.status(200).send({
        apiKeyData
    });
}

/**
 * Create new API key data for user with id [req.user._id]
 * @param req 
 * @param res 
 */
export const createAPIKeyData = async (req: Request, res: Response) => {
    let apiKey, apiKeyData;
    try {
        const { name, expiresIn } = req.body;
        
        const secret = crypto.randomBytes(16).toString('hex');
        const secretHash = await bcrypt.hash(secret, SALT_ROUNDS);
        
		const expiresAt = new Date();
		expiresAt.setSeconds(expiresAt.getSeconds() + expiresIn);
        
        apiKeyData = await new APIKeyData({
            name,
            expiresAt,
            user: req.user._id,
            secretHash
        }).save();
        
        // return api key data without sensitive data
        apiKeyData = await APIKeyData.findById(apiKeyData._id);
        
        if (!apiKeyData) throw new Error('Failed to find API key data');
        
        apiKey = `ak.${apiKeyData._id.toString()}.${secret}`;
            
    } catch (err) {
        Sentry.setUser({ email: req.user.email });
        Sentry.captureException(err);
        return res.status(400).send({
            message: 'Failed to API key data'
        });
    }
    
    return res.status(200).send({
        apiKey,
        apiKeyData
    });
}

/**
 * Delete API key data with id [apiKeyDataId].
 * @param req 
 * @param res 
 * @returns 
 */
export const deleteAPIKeyData = async (req: Request, res: Response) => {
    let apiKeyData;
    try {
        const { apiKeyDataId } = req.params;

        apiKeyData = await APIKeyData.findByIdAndDelete(apiKeyDataId);
        
    } catch (err) {
        Sentry.setUser({ email: req.user.email });
        Sentry.captureException(err);
        return res.status(400).send({
            message: 'Failed to delete API key data'
        });
    }
    
    return res.status(200).send({
        apiKeyData
    });
}