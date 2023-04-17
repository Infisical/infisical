import { Request, Response } from 'express';
import { Types } from 'mongoose';
import { SecretService, TelemetryService } from '../../services';
import { getAuthDataPayloadIdObj } from '../../utils/auth';
import { BadRequestError } from '../../utils/errors';

/**
 * Get secrets for workspace with id [workspaceId] and environment
 * [environment]
 * @param req 
 * @param res 
 */
export const getSecrets = async (req: Request, res: Response) => {
    const workspaceId = req.query.workspaceId as string;
    const environment = req.query.environment as string;

    const secrets = await SecretService.getSecrets({
        workspaceId: new Types.ObjectId(workspaceId),
        environment,
        authData: req.authData
    });

    const postHogClient = TelemetryService.getPostHogClient();
    if (postHogClient) {
        postHogClient.capture({
            event: 'secrets pulled',
            distinctId: TelemetryService.getDistinctId({
                user: req.user,
                serviceAccount: req.serviceAccount,
                serviceTokenData: req.serviceTokenData
            }),
            properties: {
                numberOfSecrets: secrets.length,
                environment,
                workspaceId,
                channel: req.authData.authChannel,
                userAgent: req.headers?.['user-agent']
            }
        });
    }

    return res.status(200).send({
        secrets
    });
}

/**
 * Get secret with name [secretName]
 * @param req 
 * @param res 
 */
export const getSecretByName = async (req: Request, res: Response) => {
    const { secretName } = req.params;
    const workspaceId = req.query.workspaceId as string;
    const environment = req.query.environment as string;
    const type = req.query.type as 'shared' | 'personal' | undefined;
    
    const secret = await SecretService.getSecret({
        secretName,
        workspaceId: new Types.ObjectId(workspaceId),
        environment,
        type,
        authData: req.authData
    });

    const postHogClient = TelemetryService.getPostHogClient();
    if (postHogClient) {
        postHogClient.capture({
            event: 'secrets pull',
            distinctId: TelemetryService.getDistinctId({
                user: req.user,
                serviceAccount: req.serviceAccount,
                serviceTokenData: req.serviceTokenData
            }),
            properties: {
                numberOfSecrets: 1,
                environment,
                workspaceId,
                channel: req.authData.authChannel,
                userAgent: req.headers?.['user-agent']
            }
        });
    }
    
    return res.status(200).send({
        secret
    });
}

/**
 * Create secret with name [secretName]
 * @param req 
 * @param res 
 */
export const createSecret = async (req: Request, res: Response) => {
    const { secretName } = req.params;
    const { 
        workspaceId,
        environment,
        type,
        secretKeyCiphertext,
        secretKeyIV,
        secretKeyTag,
        secretValueCiphertext,
        secretValueIV,
        secretValueTag
    } = req.body;
    
    const secret = await SecretService.createSecret({
        secretName,
        workspaceId: new Types.ObjectId(workspaceId),
        environment,
        type,
        authData: req.authData,
        secretKeyCiphertext,
        secretKeyIV,
        secretKeyTag,
        secretValueCiphertext,
        secretValueIV,
        secretValueTag
    });

    const postHogClient = TelemetryService.getPostHogClient();
    if (postHogClient) {
        postHogClient.capture({
            event: 'secrets added',
            distinctId: TelemetryService.getDistinctId({
                user: req.user,
                serviceAccount: req.serviceAccount,
                serviceTokenData: req.serviceTokenData
            }),
            properties: {
                numberOfSecrets: 1,
                environment,
                workspaceId,
                channel: req.authData.authChannel,
                userAgent: req.headers?.['user-agent']
            }
        });
    }

    const secretWithoutBlindIndex = secret.toObject();
    delete secretWithoutBlindIndex.secretBlindIndex;
    
    return res.status(200).send({
        secret: secretWithoutBlindIndex
    });
}

/**
 * Update secret with name [secretName]
 * @param req
 * @param res 
 */
export const updateSecretByName = async (req: Request, res: Response) => {
    const { secretName } = req.params;
    const {
        workspaceId,
        environment,
        type,
        secretValueCiphertext,
        secretValueIV,
        secretValueTag
    } = req.body;

    const secret = await SecretService.updateSecret({
        secretName,
        workspaceId,
        environment,
        type,
        authData: req.authData,
        secretValueCiphertext,
        secretValueIV,
        secretValueTag
    });


    const postHogClient = TelemetryService.getPostHogClient();
    if (postHogClient) {
        postHogClient.capture({
            event: 'secrets modified',
            distinctId: TelemetryService.getDistinctId({
                user: req.user,
                serviceAccount: req.serviceAccount,
                serviceTokenData: req.serviceTokenData
            }),
            properties: {
                numberOfSecrets: 1,
                environment,
                workspaceId,
                channel: req.authData.authChannel,
                userAgent: req.headers?.['user-agent']
            }
        });
    }

    return res.status(200).send({
        secret
    });
}

/**
 * Delete secret with name [secretName]
 * @param req 
 * @param res 
 */
export const deleteSecretByName = async (req: Request, res: Response) => {
    const { secretName } = req.params;
    const {
        workspaceId,
        environment,
        type
    } = req.body;
    
    const { secret, secrets } = await SecretService.deleteSecret({
        secretName,
        workspaceId,
        environment,
        type,
        authData: req.authData
    });

    const postHogClient = TelemetryService.getPostHogClient();
    if (postHogClient) {
        postHogClient.capture({
            event: 'secrets deleted',
            distinctId: TelemetryService.getDistinctId({
                user: req.user,
                serviceAccount: req.serviceAccount,
                serviceTokenData: req.serviceTokenData
            }),
            properties: {
                numberOfSecrets: secrets.length,
                environment,
                workspaceId,
                channel: req.authData.authChannel,
                userAgent: req.headers?.['user-agent']
            }
        });
    }

    return res.status(200).send({
        secret
    });
}