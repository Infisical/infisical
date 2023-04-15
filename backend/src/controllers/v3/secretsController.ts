import { Request, Response } from 'express';
import { Types } from 'mongoose';
import {
    Secret
} from '../../models';
import crypto from 'crypto';
import { SecretService } from '../../services';


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
        value,
        type,
        secretKeyCiphertext,
        secretKeyIV,
        secretKeyTag,
        secretValueCiphertext,
        secretValueIV,
        secretValueTag
    } = req.body;
    
    const secretBlindIndex = await SecretService.createSecretBlindIndex({
        secretName,
        workspaceId: new Types.ObjectId(workspaceId)
    });
    
    // // use workspace salt
    // const randomBytes = crypto.randomBytes(16);
    
    // // generate blind index
    // // TODO 1: abstract away into create blind index function
    // // TODO 2: create a get blind index function
    // const secretBlindIndex = (await argon2.hash(secretName, {
    //     type: argon2.argon2id,
    //     salt: randomBytes,
    //     saltLength: 16, // default 16 bytes
    //     memoryCost: 65536, // default pool of 64 MiB per thread.
    //     hashLength: 32,
    //     parallelism: 1,
    //     raw: true
    // })).toString('base64');
    
    // const secret = await new Secret({
    //     workspace: new Types.ObjectId(workspaceId),
    //     environment,
    //     type,
    //     secretBlindIndex,
    //     secretKeyCiphertext,
    //     secretKeyIV,
    //     secretKeyTag,
    //     secretValueCiphertext,
    //     secretValueIV,
    //     secretValueTag
    // }).save();
    
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