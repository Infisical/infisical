import { Request, Response } from 'express';
import {
    Secret
} from '../../models';

/**
 * Get secrets for workspace with id [workspaceId] and environment
 * [environment]
 * @param req 
 * @param res 
 */
export const getSecrets = async (req: Request, res: Response) => {
    return res.status(200).send({

    });
}

/**
 * Return secret with name [secretName] for workspace with id [workspaceId]
 * and environment [environment]
 * @param req 
 * @param res 
 */
export const getSecretByName = async (req: Request, res: Response) => {
    return res.status(200).send({
    
    });
}

/**
 * Create secret for workspace with id [workspaceId] and
 * environment [environment]
 * @param req 
 * @param res 
 */
export const createSecret = async (req: Request, res: Response) => {
    const { workspaceId } = req.params;
    
    return res.status(200).send({
    
    });
}

/**
 * Update secret with name [secretName] in workspace with id [workspaceId]
 * @param req
 * @param res 
 */
export const updateSecretByName = async (req: Request, res: Response) => {

    return res.status(200).send({
    
    });
}

/**
 * Delete secret with name [secretName] in workspace with id [workspaceId]
 * @param req 
 * @param res 
 */
export const deleteSecretByName = async (req: Request, res: Response) => {
    
    return res.status(200).send({
    
    });
}