import to from 'await-to-js';
import { Types } from 'mongoose';
import { Request, Response } from 'express';
import { ISecret, Secret } from '../../models';
import {
    SECRET_PERSONAL,
    SECRET_SHARED,
    ACTION_ADD_SECRETS,
    ACTION_READ_SECRETS,
    ACTION_UPDATE_SECRETS,
    ACTION_DELETE_SECRETS
} from '../../variables';
import { ValidationError } from '../../utils/errors';
import { EventService } from '../../services';
import { eventPushSecrets } from '../../events';
import { EESecretService, EELogService } from '../../ee/services';
import { postHogClient } from '../../services';
import { BadRequestError } from '../../utils/errors';

/**
 * Create secret(s) for workspace with id [workspaceId] and environment [environment]
 * @param req 
 * @param res 
 */
export const createSecrets = async (req: Request, res: Response) => {
    const channel = req.headers?.['user-agent']?.toLowerCase().includes('mozilla') ? 'web' : 'cli';
    const { workspaceId, environment } = req.body;

    let toAdd;
    if (Array.isArray(req.body.secrets)) {
        // case: create multiple secrets
        toAdd = req.body.secrets;
    } else if (typeof req.body.secrets === 'object') {
        // case: create 1 secret
        toAdd = [req.body.secrets];
    }

    const newSecrets = await Secret.insertMany(
        toAdd.map(({
            type,
            secretKeyCiphertext,
            secretKeyIV,
            secretKeyTag,
            secretValueCiphertext,
            secretValueIV,
            secretValueTag,
        }: {
            type: string;
            secretKeyCiphertext: string;
            secretKeyIV: string;
            secretKeyTag: string;
            secretValueCiphertext: string;
            secretValueIV: string;
            secretValueTag: string;
        }) => ({
            version: 1,
            workspace: new Types.ObjectId(workspaceId),
            type,
            user: type === SECRET_PERSONAL ? req.user : undefined,
            environment,
            secretKeyCiphertext,
            secretKeyIV,
            secretKeyTag,
            secretValueCiphertext,
            secretValueIV,
            secretValueTag
        }))
    );

    // (EE) add secret versions for new secrets
    EESecretService.addSecretVersions({
        secretVersions: newSecrets.map(({
            _id,
            version,
            workspace,
            type,
            user,
            environment,
            secretKeyCiphertext,
            secretKeyIV,
            secretKeyTag,
            secretKeyHash,
            secretValueCiphertext,
            secretValueIV,
            secretValueTag,
            secretValueHash
        }) => ({
            _id: new Types.ObjectId(),
            secret: _id,
            version,
            workspace,
            type,
            user,
            environment,
            isDeleted: false,
            secretKeyCiphertext,
            secretKeyIV,
            secretKeyTag,
            secretKeyHash,
            secretValueCiphertext,
            secretValueIV,
            secretValueTag,
            secretValueHash
        }))
    });

    // trigger event - push secrets
    await EventService.handleEvent({
        event: eventPushSecrets({
            workspaceId
        })
    });

    const addAction = await EELogService.createActionSecret({
        name: ACTION_ADD_SECRETS,
        userId: req.user._id.toString(),
        workspaceId,
        secretIds: newSecrets.map((n) => n._id)
    });

    // (EE) create (audit) log
    addAction && await EELogService.createLog({
        userId: req.user._id.toString(),
        workspaceId,
        actions: [addAction],
        channel,
        ipAddress: req.ip
    });

    // (EE) take a secret snapshot
    await EESecretService.takeSecretSnapshot({
        workspaceId
    });

    if (postHogClient) {
        postHogClient.capture({
            event: 'secrets added',
            distinctId: req.user.email,
            properties: {
                numberOfSecrets: toAdd.length,
                environment,
                workspaceId,
                channel: req.headers?.['user-agent']?.toLowerCase().includes('mozilla') ? 'web' : 'cli',
                userAgent: req.headers?.['user-agent']
            }
        });
    }

    return res.status(200).send({
        secrets: newSecrets
    });
}

/**
 * Return secret(s) for workspace with id [workspaceId], environment [environment] and user
 * with id [req.user._id]
 * @param req 
 * @param res 
 * @returns 
 */
export const getSecrets = async (req: Request, res: Response) => {
    const { workspaceId, environment } = req.query;

    let userId: Types.ObjectId | undefined = undefined // used for getting personal secrets for user
    let userEmail: Types.ObjectId | undefined = undefined // used for posthog 
    if (req.user) {
        userId = req.user._id;
        userEmail = req.user.email;
    }

    if (req.serviceTokenData) {
        userId = req.serviceTokenData.user._id
        userEmail = req.serviceTokenData.user.email;
    }

    const [err, secrets] = await to(Secret.find(
        {
            workspace: workspaceId,
            environment,
            $or: [
                { user: userId },
                { user: { $exists: false } }
            ],
            type: { $in: [SECRET_SHARED, SECRET_PERSONAL] }
        }
    ).then())

    if (err) throw ValidationError({ message: 'Failed to get secrets', stack: err.stack });

    const channel = req.headers?.['user-agent']?.toLowerCase().includes('mozilla') ? 'web' : 'cli';

    const readAction = await EELogService.createActionSecret({
        name: ACTION_READ_SECRETS,
        userId: req.user._id.toString(),
        workspaceId: workspaceId as string,
        secretIds: secrets.map((n: any) => n._id)
    });

    readAction && await EELogService.createLog({
        userId: req.user._id.toString(),
        workspaceId: workspaceId as string,
        actions: [readAction],
        channel,
        ipAddress: req.ip
    });

    if (postHogClient) {
        postHogClient.capture({
            event: 'secrets added',
            distinctId: userEmail,
            properties: {
                numberOfSecrets: secrets.length,
                environment,
                workspaceId,
                channel,
                userAgent: req.headers?.['user-agent']
            }
        });
    }

    return res.status(200).send({
        secrets
    });
}

/**
 * Update secret(s)
 * @param req 
 * @param res 
 */
export const updateSecrets = async (req: Request, res: Response) => {
    const channel = req.headers?.['user-agent']?.toLowerCase().includes('mozilla') ? 'web' : 'cli';

    // TODO: move type
    interface PatchSecret {
        id: string;
        secretKeyCiphertext: string;
        secretKeyIV: string;
        secretKeyTag: string;
        secretValueCiphertext: string;
        secretValueIV: string;
        secretValueTag: string;
        secretCommentCiphertext: string;
        secretCommentIV: string;
        secretCommentTag: string;
    }

    const updateOperationsToPerform = req.body.secrets.map((secret: PatchSecret) => {
        const {
            secretKeyCiphertext,
            secretKeyIV,
            secretKeyTag,
            secretValueCiphertext,
            secretValueIV,
            secretValueTag,
            secretCommentCiphertext,
            secretCommentIV,
            secretCommentTag
        } = secret;

        return ({
            updateOne: {
                filter: { _id: new Types.ObjectId(secret.id) },
                update: {
                    $inc: {
                        version: 1
                    },
                    secretKeyCiphertext,
                    secretKeyIV,
                    secretKeyTag,
                    secretValueCiphertext,
                    secretValueIV,
                    secretValueTag,
                    ...((
                        secretCommentCiphertext &&
                        secretCommentIV &&
                        secretCommentTag
                    ) ? {
                        secretCommentCiphertext,
                        secretCommentIV,
                        secretCommentTag
                    } : {}),
                }
            }
        });
    });

    await Secret.bulkWrite(updateOperationsToPerform);

    const secretModificationsBySecretId: { [key: string]: PatchSecret } = {};
    req.body.secrets.forEach((secret: PatchSecret) => {
        secretModificationsBySecretId[secret.id] = secret;
    });

    const ListOfSecretsBeforeModifications = req.secrets
    const secretVersions = {
        secretVersions: ListOfSecretsBeforeModifications.map((secret: ISecret) => {
            const {
                secretKeyCiphertext,
                secretKeyIV,
                secretKeyTag,
                secretValueCiphertext,
                secretValueIV,
                secretValueTag,
                secretCommentCiphertext,
                secretCommentIV,
                secretCommentTag,
            } = secretModificationsBySecretId[secret._id.toString()]

            return ({
                secret: secret._id,
                version: secret.version + 1,
                workspace: secret.workspace,
                type: secret.type,
                environment: secret.environment,
                secretKeyCiphertext: secretKeyCiphertext ? secretKeyCiphertext : secret.secretKeyCiphertext,
                secretKeyIV: secretKeyIV ? secretKeyIV : secret.secretKeyIV,
                secretKeyTag: secretKeyTag ? secretKeyTag : secret.secretKeyTag,
                secretValueCiphertext: secretValueCiphertext ? secretValueCiphertext : secret.secretValueCiphertext,
                secretValueIV: secretValueIV ? secretValueIV : secret.secretValueIV,
                secretValueTag: secretValueTag ? secretValueTag : secret.secretValueTag,
                secretCommentCiphertext: secretCommentCiphertext ? secretCommentCiphertext : secret.secretCommentCiphertext,
                secretCommentIV: secretCommentIV ? secretCommentIV : secret.secretCommentIV,
                secretCommentTag: secretCommentTag ? secretCommentTag : secret.secretCommentTag,
            });
        })
    }

    await EESecretService.addSecretVersions(secretVersions);


    // group secrets into workspaces so updated secrets can
    // be logged and snapshotted separately for each workspace
    const workspaceSecretObj: any = {};
    req.secrets.forEach((s: any) => {
        if (s.workspace.toString() in workspaceSecretObj) {
            workspaceSecretObj[s.workspace.toString()].push(s);
        } else {
            workspaceSecretObj[s.workspace.toString()] = [s]
        }
    });

    Object.keys(workspaceSecretObj).forEach(async (key) => {
        // trigger event - push secrets
        await EventService.handleEvent({
            event: eventPushSecrets({
                workspaceId: key
            })
        });

        const updateAction = await EELogService.createActionSecret({
            name: ACTION_UPDATE_SECRETS,
            userId: req.user._id.toString(),
            workspaceId: key,
            secretIds: workspaceSecretObj[key].map((secret: ISecret) => secret._id)
        });

        // (EE) create (audit) log
        updateAction && await EELogService.createLog({
            userId: req.user._id.toString(),
            workspaceId: key,
            actions: [updateAction],
            channel,
            ipAddress: req.ip
        });

        // (EE) take a secret snapshot
        await EESecretService.takeSecretSnapshot({
            workspaceId: key
        })

        if (postHogClient) {
            postHogClient.capture({
                event: 'secrets modified',
                distinctId: req.user.email,
                properties: {
                    numberOfSecrets: workspaceSecretObj[key].length,
                    environment: workspaceSecretObj[key][0].environment,
                    workspaceId: key,
                    channel: req.headers?.['user-agent']?.toLowerCase().includes('mozilla') ? 'web' : 'cli',
                    userAgent: req.headers?.['user-agent']
                }
            });
        }
    });

    return res.status(200).send({
        secrets: await Secret.find({
            _id: {
                $in: req.secrets.map((secret: ISecret) => secret._id)
            }
        })
    });
}

/**
 * Delete secret(s) with id [workspaceId] and environment [environment]
 * @param req 
 * @param res 
 */
export const deleteSecrets = async (req: Request, res: Response) => {
    const channel = req.headers?.['user-agent']?.toLowerCase().includes('mozilla') ? 'web' : 'cli';
    const toDelete = req.secrets.map((s: any) => s._id);

    await Secret.deleteMany({
        _id: {
            $in: toDelete
        }
    });

    await EESecretService.markDeletedSecretVersions({
        secretIds: toDelete
    });

    // group secrets into workspaces so deleted secrets can
    // be logged and snapshotted separately for each workspace
    const workspaceSecretObj: any = {};
    req.secrets.forEach((s: any) => {
        if (s.workspace.toString() in workspaceSecretObj) {
            workspaceSecretObj[s.workspace.toString()].push(s);
        } else {
            workspaceSecretObj[s.workspace.toString()] = [s]
        }
    });

    Object.keys(workspaceSecretObj).forEach(async (key) => {
        // trigger event - push secrets
        await EventService.handleEvent({
            event: eventPushSecrets({
                workspaceId: key
            })
        });
        const deleteAction = await EELogService.createActionSecret({
            name: ACTION_DELETE_SECRETS,
            userId: req.user._id.toString(),
            workspaceId: key,
            secretIds: workspaceSecretObj[key].map((secret: ISecret) => secret._id)
        });

        // (EE) create (audit) log
        deleteAction && await EELogService.createLog({
            userId: req.user._id.toString(),
            workspaceId: key,
            actions: [deleteAction],
            channel,
            ipAddress: req.ip
        });

        // (EE) take a secret snapshot
        await EESecretService.takeSecretSnapshot({
            workspaceId: key
        })

        if (postHogClient) {
            postHogClient.capture({
                event: 'secrets deleted',
                distinctId: req.user.email,
                properties: {
                    numberOfSecrets: workspaceSecretObj[key].length,
                    environment: workspaceSecretObj[key][0].environment,
                    workspaceId: key,
                    channel: req.headers?.['user-agent']?.toLowerCase().includes('mozilla') ? 'web' : 'cli',
                    userAgent: req.headers?.['user-agent']
                }
            });
        }
    });

    return res.status(200).send({
        secrets: req.secrets
    });
}