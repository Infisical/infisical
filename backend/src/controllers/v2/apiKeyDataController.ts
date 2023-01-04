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
 * Create new API key for user with id [req.user._id]
 * @param req 
 * @param res 
 */
export const createAPIKey = async (req: Request, res: Response) => {
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
        });
        
        // return api key data without sensitive data
        apiKeyData = await APIKeyData.findById(apiKeyData._id);
        
        if (!apiKeyData) throw new Error('Failed to find API key data');
        
        apiKey = `ak.${apiKeyData._id.toString()}.${secret}`;
            
    } catch (err) {
        Sentry.setUser({ email: req.user.email });
        Sentry.captureException(err);
        return res.status(400).send({
            message: 'Failed to create service token data'
        });
    }
    
    return res.status(200).send({
        apiKey,
        apiKeyData
    });
}