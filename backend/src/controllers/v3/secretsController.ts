import { Request, Response } from 'express';
import {
    Secret
} from '../../models';

// TODO: modularize argon2id
import * as argon2 from 'argon2';

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
    const { secretName } = req.params;
    const workspaceId = req.query.workspaceId as string;
    const environment = req.query.workspaceId as string;
    
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
    // TODO: the middleware should've prevalidated that the
    // workspace with id [workspaceId] has disabled E2EE
    const { secretName } = req.params;
    const { 
        workspaceId,
        environment,
        value
    } = req.body;
    
    //
    // use bot to encrypt value
    // BotService.encryptSymmetric(value)
    
    
    return res.status(200).send({
    
    });
}

/**
 * Update secret with name [secretName] in workspace with id [workspaceId]
 * @param req
 * @param res 
 */
export const updateSecretByName = async (req: Request, res: Response) => {
    const { secretName } = req.params;

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