import to from 'await-to-js';
import { Types } from 'mongoose';
import { Request, Response } from 'express';
import { ISecret, Membership, Secret, Workspace } from '../../models';
import {
    SECRET_PERSONAL,
    SECRET_SHARED,
    ACTION_ADD_SECRETS,
    ACTION_READ_SECRETS,
    ACTION_UPDATE_SECRETS,
    ACTION_DELETE_SECRETS
} from '../../variables';
import { UnauthorizedRequestError, ValidationError } from '../../utils/errors';
import { EventService } from '../../services';
import { eventPushSecrets } from '../../events';
import { EESecretService, EELogService } from '../../ee/services';
import { postHogClient } from '../../services';
import { getChannelFromUserAgent } from '../../utils/posthog';
import { ABILITY_READ, ABILITY_WRITE } from '../../variables/organization';
import { userHasWorkspaceAccess } from '../../ee/helpers/checkMembershipPermissions';

/**
 * Create secret(s) for workspace with id [workspaceId] and environment [environment]
 * @param req 
 * @param res 
 */
export const createSecrets = async (req: Request, res: Response) => {
    /* 
    #swagger.summary = 'Create new secret(s)'
    #swagger.description = 'Create one or many secrets for a given project and environment.'
    
    #swagger.security = [{
        "apiKeyAuth": []
    }]

    #swagger.requestBody = {
      "required": true,
      "content": {
        "application/json": {
          "schema": {
            "type": "object",
            "properties": {
                "workspaceId": {
                    "type": "string",
                    "description": "ID of project",
                },
                "environment": {
                    "type": "string",
                    "description": "Environment within project"
                },
                "secrets": {
                    $ref: "#/components/schemas/CreateSecret",
                    "description": "Secret(s) to create - object or array of objects"
                }
            }
          }
        }
      }
    }

    #swagger.responses[200] = {
        content: {
            "application/json": {
                "schema": { 
                    "type": "object",
                    "properties": {
                        "secrets": {
                            "type": "array",
                            "items": {
                                $ref: "#/components/schemas/Secret" 
                            },
                            "description": "Newly-created secrets for the given project and environment"
                        }
                    }
                }
            }           
        }
    }   
    */

    const channel = getChannelFromUserAgent(req.headers['user-agent'])
    const { workspaceId, environment }: { workspaceId: string, environment: string } = req.body;

    const hasAccess = await userHasWorkspaceAccess(req.user, workspaceId, environment, ABILITY_WRITE)
    if (!hasAccess) {
        throw UnauthorizedRequestError({ message: "You do not have the necessary permission(s) perform this action" })
    }

    let listOfSecretsToCreate;
    if (Array.isArray(req.body.secrets)) {
        // case: create multiple secrets
        listOfSecretsToCreate = req.body.secrets;
    } else if (typeof req.body.secrets === 'object') {
        // case: create 1 secret
        listOfSecretsToCreate = [req.body.secrets];
    }

    type secretsToCreateType = {
        type: string;
        secretKeyCiphertext: string;
        secretKeyIV: string;
        secretKeyTag: string;
        secretValueCiphertext: string;
        secretValueIV: string;
        secretValueTag: string;
        tags: string[]
    }

    const newlyCreatedSecrets = await Secret.insertMany(
        listOfSecretsToCreate.map(({
            type,
            secretKeyCiphertext,
            secretKeyIV,
            secretKeyTag,
            secretValueCiphertext,
            secretValueIV,
            secretValueTag,
            tags
        }: secretsToCreateType) => {
            return ({
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
                secretValueTag,
                tags
            });
        })
    );

    setTimeout(async () => {
        // trigger event - push secrets
        await EventService.handleEvent({
            event: eventPushSecrets({
                workspaceId
            })
        });
    }, 5000);

    // (EE) add secret versions for new secrets
    await EESecretService.addSecretVersions({
        secretVersions: newlyCreatedSecrets.map(({
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
            secretValueHash,
            tags
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
            secretValueHash,
            tags
        }))
    });

    const addAction = await EELogService.createAction({
        name: ACTION_ADD_SECRETS,
        userId: req.user._id,
        workspaceId: new Types.ObjectId(workspaceId),
        secretIds: newlyCreatedSecrets.map((n) => n._id)
    });

    // (EE) create (audit) log
    addAction && await EELogService.createLog({
        userId: req.user._id.toString(),
        workspaceId: new Types.ObjectId(workspaceId),
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
                numberOfSecrets: listOfSecretsToCreate.length,
                environment,
                workspaceId,
                channel: channel,
                userAgent: req.headers?.['user-agent']
            }
        });
    }

    return res.status(200).send({
        secrets: newlyCreatedSecrets
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
    /* 
    #swagger.summary = 'Read secrets'
    #swagger.description = 'Read secrets from a project and environment'
    
    #swagger.security = [{
        "apiKeyAuth": []
    }]

    #swagger.parameters['workspaceId'] = {
        "description": "ID of project",
        "required": true,
        "type": "string"
    }

    #swagger.parameters['environment'] = {
        "description": "Environment within project",
        "required": true,
        "type": "string"
    }

    #swagger.responses[200] = {
        content: {
            "application/json": {
                "schema": { 
                    "type": "object",
                    "properties": {
                        "secrets": {
                            "type": "array",
                            "items": {
                                $ref: "#/components/schemas/Secret" 
                            },
                            "description": "Secrets for the given project and environment"
                        }
                    }
                }
            }           
        }
    }   
    */
    const { workspaceId, environment } = req.query;

    let userId = "" // used for getting personal secrets for user
    let userEmail = "" // used for posthog 
    if (req.user) {
        userId = req.user._id;
        userEmail = req.user.email;
    }

    if (req.serviceTokenData) {
        userId = req.serviceTokenData.user._id
        userEmail = req.serviceTokenData.user.email;
    }

    // none service token case as service tokens are already scoped
    if (!req.serviceTokenData) {
        const hasAccess = await userHasWorkspaceAccess(userId, workspaceId, environment, ABILITY_READ)
        if (!hasAccess) {
            throw UnauthorizedRequestError({ message: "You do not have the necessary permission(s) perform this action" })
        }
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
    ).populate("tags").then())

    if (err) throw ValidationError({ message: 'Failed to get secrets', stack: err.stack });

    const channel = getChannelFromUserAgent(req.headers['user-agent'])

    const readAction = await EELogService.createAction({
        name: ACTION_READ_SECRETS,
        userId: new Types.ObjectId(userId),
        workspaceId: new Types.ObjectId(workspaceId as string),
        secretIds: secrets.map((n: any) => n._id)
    });

    readAction && await EELogService.createLog({
        userId: new Types.ObjectId(userId),
        workspaceId: new Types.ObjectId(workspaceId as string),
        actions: [readAction],
        channel,
        ipAddress: req.ip
    });

    if (postHogClient) {
        postHogClient.capture({
            event: 'secrets pulled',
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
    /* 
    #swagger.summary = 'Update secret(s)'
    #swagger.description = 'Update secret(s)'
    
    #swagger.security = [{
        "apiKeyAuth": []
    }]

    #swagger.requestBody = {
      "required": true,
      "content": {
        "application/json": {
          "schema": {
            "type": "object",
            "properties": {
                "secrets": {
                    $ref: "#/components/schemas/UpdateSecret",
                    "description": "Secret(s) to update - object or array of objects"
                }
            }
          }
        }
      }
    }

    #swagger.responses[200] = {
        content: {
            "application/json": {
                "schema": { 
                    "type": "object",
                    "properties": {
                        "secrets": {
                            "type": "array",
                            "items": {
                                $ref: "#/components/schemas/Secret" 
                            },
                            "description": "Updated secrets"
                        }
                    }
                }
            }           
        }
    }
    */
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
        tags: string[]
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
            secretCommentTag,
            tags
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
                    tags,
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
                tags
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
                tags: tags ? tags : secret.tags
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
        setTimeout(async () => {
            await EventService.handleEvent({
                event: eventPushSecrets({
                    workspaceId: key
                })
            });
        }, 10000);

        const updateAction = await EELogService.createAction({
            name: ACTION_UPDATE_SECRETS,
            userId: req.user._id,
            workspaceId: new Types.ObjectId(key),
            secretIds: workspaceSecretObj[key].map((secret: ISecret) => secret._id)
        });

        // (EE) create (audit) log
        updateAction && await EELogService.createLog({
            userId: req.user._id.toString(),
            workspaceId: new Types.ObjectId(key),
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
                    channel: channel,
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
    /* 
    #swagger.summary = 'Delete secret(s)'
    #swagger.description = 'Delete one or many secrets by their ID(s)'
    
    #swagger.security = [{
        "apiKeyAuth": []
    }]

    #swagger.requestBody = {
      "required": true,
      "content": {
        "application/json": {
          "schema": {
            "type": "object",
            "properties": {
                "secretIds": {
                    "type": "string",
                    "description": "ID(s) of secrets - string or array of strings"
                },
            }
          }
        }
      }
    }

    #swagger.responses[200] = {
        content: {
            "application/json": {
                "schema": { 
                    "type": "object",
                    "properties": {
                        "secrets": {
                            "type": "array",
                            "items": {
                                $ref: "#/components/schemas/Secret" 
                            },
                            "description": "Deleted secrets"
                        }
                    }
                }
            }           
        }
    }   
    */
    const channel = getChannelFromUserAgent(req.headers['user-agent'])
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
        const deleteAction = await EELogService.createAction({
            name: ACTION_DELETE_SECRETS,
            userId: req.user._id,
            workspaceId: new Types.ObjectId(key),
            secretIds: workspaceSecretObj[key].map((secret: ISecret) => secret._id)
        });

        // (EE) create (audit) log
        deleteAction && await EELogService.createLog({
            userId: req.user._id.toString(),
            workspaceId: new Types.ObjectId(key),
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
                    channel: channel,
                    userAgent: req.headers?.['user-agent']
                }
            });
        }
    });

    return res.status(200).send({
        secrets: req.secrets
    });
}