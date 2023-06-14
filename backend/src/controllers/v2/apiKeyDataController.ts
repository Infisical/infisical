import { Request, Response } from 'express';
import crypto from 'crypto';
import bcrypt from 'bcrypt';
import {
    APIKeyData
} from '../../models';
import { getSaltRounds } from '../../config';

/**
 * Return API key data for user with id [req.user_id]
 * @param req
 * @param res 
 * @returns 
 */
export const getAPIKeyData = async (req: Request, res: Response) => {
    const apiKeyData = await APIKeyData.find({
        user: req.user._id
    });
    
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
    const { name, expiresIn } = req.body;
    
    const secret = crypto.randomBytes(16).toString('hex');
    const secretHash = await bcrypt.hash(secret, await getSaltRounds());
    
    const expiresAt = new Date();
    expiresAt.setSeconds(expiresAt.getSeconds() + expiresIn);
    
    let apiKeyData = await new APIKeyData({
        name,
        lastUsed: new Date(),
        expiresAt,
        user: req.user._id,
        secretHash
    }).save();
    
    // return api key data without sensitive data
    // FIX: fix this any
    apiKeyData = await APIKeyData.findById(apiKeyData._id) as any
    
    if (!apiKeyData) throw new Error('Failed to find API key data');
    
    const apiKey = `ak.${apiKeyData._id.toString()}.${secret}`;
            
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
    const { apiKeyDataId } = req.params;
    const apiKeyData = await APIKeyData.findByIdAndDelete(apiKeyDataId);
    
    return res.status(200).send({
        apiKeyData
    });
}
