import { Request, Response } from 'express';
import { Types } from 'mongoose';
import { 
    SecretService, 
    TelemetryService,
    EventService
} from '../../services';
import { eventPushSecrets } from '../../events';
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
        secretValueTag,
        secretCommentCiphertext,
        secretCommentIV,
        secretCommentTag
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
        secretValueTag,
        ...((secretCommentCiphertext && secretCommentIV && secretCommentTag) ? {
            secretCommentCiphertext,
            secretCommentIV,
            secretCommentTag
        } : {})
    });

    await EventService.handleEvent({
        event: eventPushSecrets({
            workspaceId: new Types.ObjectId(workspaceId),
            environment
        })
    });

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
    
    await EventService.handleEvent({
        event: eventPushSecrets({
            workspaceId: new Types.ObjectId(workspaceId),
            environment
        })
    });

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

    await EventService.handleEvent({
        event: eventPushSecrets({
            workspaceId: new Types.ObjectId(workspaceId),
            environment
        })
    });

    return res.status(200).send({
        secret
    });
}