import { Request, Response } from 'express';
import { Types } from 'mongoose';
import { Secret, Workspace, SecretBlindIndexData } from '../../models';
import { SecretService } from'../../services';
import { BadRequestError } from '../../utils/errors';
import { decryptSymmetric } from '../../utils/crypto';
import { getEncryptionKey } from '../../config';
import * as argon2 from 'argon2';

/**
 * Return whether or not all secrets in workspace with id [workspaceId]
 * are blind-indexed
 * @param req 
 * @param res 
 * @returns 
 */
export const getWorkspaceBlindIndexStatus = async (req: Request, res: Response) => {
    const { workspaceId } = req.params;

    const secretsWithoutBlindIndex = await Secret.countDocuments({
        workspace: new Types.ObjectId(workspaceId)
    });

    const isBlindIndexed = secretsWithoutBlindIndex === 0;

    return res.status(200).send(isBlindIndexed);
}

/**
 * Get all secrets for workspace with id [workspaceId]
 */
export const getWorkspaceSecrets = async (req: Request, res: Response) => {
    const { workspaceId } = req.params;

    const secrets = await Secret.find({
        workspace: new Types.ObjectId (workspaceId)
    });
    
    return res.status(200).send({
        secrets
    });
}

/**
 * Update blind indices for secrets in workspace with id [workspaceId]
 * @param req 
 * @param res 
 */
export const nameWorkspaceSecrets = async (req: Request, res: Response) => {

    interface SecretToUpdate {
        secretName: string;
        _id: string;
    }

    const { workspaceId } = req.params;
    const { 
        secretsToUpdate 
    }: {
        secretsToUpdate: SecretToUpdate[];
    } = req.body;

    // get secret blind index salt
    const salt = await SecretService.getSecretBlindIndexSalt({
        workspaceId: new Types.ObjectId(workspaceId)
    });

    // update secret blind indices
    const operations = await Promise.all(
        secretsToUpdate.map(async (secretToUpdate: SecretToUpdate) => {
            const secretBlindIndex = await SecretService.generateSecretBlindIndexWithSalt({
                secretName: secretToUpdate.secretName,
                salt
            });
    
            return ({
                updateOne: {
                    filter: {
                        _id: new Types.ObjectId(secretToUpdate._id)
                    },
                    update: {
                        secretBlindIndex
                    }
                }
            });
        })
    );

    await Secret.bulkWrite(operations);

    return res.status(200).send({
        operations
    });
}