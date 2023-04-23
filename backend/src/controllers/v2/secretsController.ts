import to from 'await-to-js';
import { Types } from 'mongoose';
import { Request, Response } from 'express';
import { ISecret, Secret } from '../../models';
import { IAction, SecretVersion } from '../../ee/models';
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
import { TelemetryService, SecretService } from '../../services';
import { getChannelFromUserAgent } from '../../utils/posthog';
import { PERMISSION_WRITE_SECRETS } from '../../variables';
import { userHasNoAbility, userHasWorkspaceAccess, userHasWriteOnlyAbility } from '../../ee/helpers/checkMembershipPermissions';
import Tag from '../../models/tag';
import _, { eq } from 'lodash';
import {
    BatchSecretRequest,
    BatchSecret
} from '../../types/secret';

/**
 * Peform a batch of any specified CUD secret operations
 * (used by dashboard)
 * @param req 
 * @param res 
 */
export const batchSecrets = async (req: Request, res: Response) => {

    const channel = getChannelFromUserAgent(req.headers['user-agent']);
    const postHogClient = TelemetryService.getPostHogClient();

    const {
        workspaceId,
        environment,
        requests
    }: {
        workspaceId: string;
        environment: string;
        requests: BatchSecretRequest[];
    } = req.body;

    const createSecrets: BatchSecret[] = [];
    const updateSecrets: BatchSecret[] = [];
    const deleteSecrets: Types.ObjectId[] = [];
    const actions: IAction[] = [];
    
    // get secret blind index salt
    const salt = await SecretService.getSecretBlindIndexSalt({
        workspaceId: new Types.ObjectId(workspaceId)
    });

    for await (const request of requests) {
        let secretBlindIndex = '';
        switch (request.method) {
            case 'POST':
                secretBlindIndex = await SecretService.generateSecretBlindIndexWithSalt({
                    secretName: request.secret.secretName,
                    salt
                });

                createSecrets.push({
                    ...request.secret,
                    version: 1,
                    user: request.secret.type === SECRET_PERSONAL ? req.user : undefined,
                    environment,
                    workspace: new Types.ObjectId(workspaceId),
                    secretBlindIndex
                });
                break;
            case 'PATCH':
                secretBlindIndex = await SecretService.generateSecretBlindIndexWithSalt({
                    secretName: request.secret.secretName,
                    salt
                });

                updateSecrets.push({
                    ...request.secret,
                    _id: new Types.ObjectId(request.secret._id),
                    secretBlindIndex
                });
                break;
            case 'DELETE':
                deleteSecrets.push(new Types.ObjectId(request.secret._id));
                break;
        }
    }

    // handle create secrets
    let createdSecrets: ISecret[] = [];
    if (createSecrets.length > 0) {
        createdSecrets = await Secret.insertMany(createSecrets);
        // (EE) add secret versions for new secrets
        await EESecretService.addSecretVersions({
            secretVersions: createdSecrets.map((n: any) => {
                return ({
                    ...n._doc,
                    _id: new Types.ObjectId(),
                    secret: n._id,
                    isDeleted: false
                });
            })
        });

        const addAction = await EELogService.createAction({
            name: ACTION_ADD_SECRETS,
            userId: req.user?._id,
            serviceAccountId: req.serviceAccount?._id,
            serviceTokenDataId: req.serviceTokenData?._id,
            workspaceId: new Types.ObjectId(workspaceId),
            secretIds: createdSecrets.map((n) => n._id)
        }) as IAction;
        actions.push(addAction);

        if (postHogClient) {
            postHogClient.capture({
                event: 'secrets added',
                distinctId: req.user.email,
                properties: {
                    numberOfSecrets: createdSecrets.length,
                    environment,
                    workspaceId,
                    channel,
                    userAgent: req.headers?.['user-agent']
                }
            });
        }
    }

    // handle update secrets
    let updatedSecrets: ISecret[] = [];
    if (updateSecrets.length > 0 && req.secrets) {
        // construct object containing all secrets
        let listedSecretsObj: {
            [key: string]: {
                version: number;
                type: string;
            }
        } = {};

        listedSecretsObj = req.secrets.reduce((obj: any, secret: ISecret) => ({
            ...obj,
            [secret._id.toString()]: secret
        }), {});

        const updateOperations = updateSecrets.map((u) => ({
            updateOne: {
                filter: {
                    _id: new Types.ObjectId(u._id),
                    workspace: new Types.ObjectId(workspaceId)
                },
                update: {
                    $inc: {
                        version: 1
                    },
                    ...u,
                    _id: new Types.ObjectId(u._id)
                }
            }
        }));

        await Secret.bulkWrite(updateOperations);

        const secretVersions = updateSecrets.map((u) => new SecretVersion({
            secret: new Types.ObjectId(u._id),
            version: listedSecretsObj[u._id.toString()].version,
            workspace: new Types.ObjectId(workspaceId),
            type: listedSecretsObj[u._id.toString()].type,
            environment,
            isDeleted: false,
            secretBlindIndex: u.secretBlindIndex,
            secretKeyCiphertext: u.secretKeyCiphertext,
            secretKeyIV: u.secretKeyIV,
            secretKeyTag: u.secretKeyTag,
            secretValueCiphertext: u.secretValueCiphertext,
            secretValueIV: u.secretValueIV,
            secretValueTag: u.secretValueTag,
            secretCommentCiphertext: u.secretCommentCiphertext,
            secretCommentIV: u.secretCommentIV,
            secretCommentTag: u.secretCommentTag,
            tags: u.tags
        }));

        await EESecretService.addSecretVersions({
            secretVersions
        });

        updatedSecrets = await Secret.find({
            _id: {
                $in: updateSecrets.map((u) => new Types.ObjectId(u._id))
            }
        });

        const updateAction = await EELogService.createAction({
            name: ACTION_UPDATE_SECRETS,
            userId: req.user._id,
            workspaceId: new Types.ObjectId(workspaceId),
            secretIds: updatedSecrets.map((u) => u._id)
        }) as IAction;
        actions.push(updateAction);

        if (postHogClient) {
            postHogClient.capture({
                event: 'secrets modified',
                distinctId: req.user.email,
                properties: {
                    numberOfSecrets: updateSecrets.length,
                    environment,
                    workspaceId,
                    channel,
                    userAgent: req.headers?.['user-agent']
                }
            });
        }
    }

    // handle delete secrets
    if (deleteSecrets.length > 0) {
        await Secret.deleteMany({
            _id: {
                $in: deleteSecrets
            }
        });

        await EESecretService.markDeletedSecretVersions({
            secretIds: deleteSecrets
        });

        const deleteAction = await EELogService.createAction({
            name: ACTION_DELETE_SECRETS,
            userId: req.user._id,
            workspaceId: new Types.ObjectId(workspaceId),
            secretIds: deleteSecrets
        }) as IAction;
        actions.push(deleteAction);

        if (postHogClient) {
            postHogClient.capture({
                event: 'secrets deleted',
                distinctId: req.user.email,
                properties: {
                    numberOfSecrets: deleteSecrets.length,
                    environment,
                    workspaceId,
                    channel: channel,
                    userAgent: req.headers?.['user-agent']
                }
            });
        }
    }

    if (actions.length > 0) {
        // (EE) create (audit) log
        await EELogService.createLog({
            userId: req.user._id.toString(),
            workspaceId: new Types.ObjectId(workspaceId),
            actions,
            channel,
            ipAddress: req.ip
        });
    }

    // // trigger event - push secrets
    await EventService.handleEvent({
        event: eventPushSecrets({
            workspaceId: new Types.ObjectId(workspaceId)
        })
    });

    // (EE) take a secret snapshot
    await EESecretService.takeSecretSnapshot({
        workspaceId: new Types.ObjectId(workspaceId)
    });

    const resObj: { [key: string]: ISecret[] | string[] } = {}

    if (createSecrets.length > 0) {
        resObj['createdSecrets'] = createdSecrets;
    }

    if (updateSecrets.length > 0) {
        resObj['updatedSecrets'] = updatedSecrets;
    }

    if (deleteSecrets.length > 0) {
        resObj['deletedSecrets'] = deleteSecrets.map((d) => d.toString());
    }

    return res.status(200).send(resObj);
}

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

    if (req.user) {
        const hasAccess = await userHasWorkspaceAccess(req.user, new Types.ObjectId(workspaceId), environment, PERMISSION_WRITE_SECRETS)
        if (!hasAccess) {
            throw UnauthorizedRequestError({ message: "You do not have the necessary permission(s) perform this action" })
        }
    }

    let listOfSecretsToCreate;
    if (Array.isArray(req.body.secrets)) {
        // case: create multiple secrets
        listOfSecretsToCreate = req.body.secrets;
    } else if (typeof req.body.secrets === 'object') {
        // case: create 1 secret
        listOfSecretsToCreate = [req.body.secrets];
    }

    // get secret blind index salt
    const salt = await SecretService.getSecretBlindIndexSalt({
        workspaceId: new Types.ObjectId(workspaceId)
    });

    type secretsToCreateType = {
        type: string;
        secretName?: string;
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

    const secretsToInsert: ISecret[] = await Promise.all(
        listOfSecretsToCreate.map(async ({
            type,
            secretName,
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
        }: secretsToCreateType) => {
            let secretBlindIndex;
            if (secretName) {
                secretBlindIndex = await SecretService.generateSecretBlindIndexWithSalt({
                    secretName,
                    salt
                });
            }

            return ({
                version: 1,
                workspace: new Types.ObjectId(workspaceId),
                type,
                ...(secretBlindIndex ? { secretBlindIndex } : {}),
                user: (req.user && type === SECRET_PERSONAL) ? req.user : undefined,
                environment,
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
            });
        })
    );
    
    const newlyCreatedSecrets: ISecret[] = (await Secret.insertMany(secretsToInsert)).map((insertedSecret) => insertedSecret.toObject());
    
    setTimeout(async () => {
        // trigger event - push secrets
        await EventService.handleEvent({
            event: eventPushSecrets({
                workspaceId: new Types.ObjectId(workspaceId)
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
            secretBlindIndex,
            secretKeyCiphertext,
            secretKeyIV,
            secretKeyTag,
            secretValueCiphertext,
            secretValueIV,
            secretValueTag
        }) => new SecretVersion({
            secret: _id,
            version,
            workspace,
            type,
            user,
            environment,
            secretBlindIndex,
            isDeleted: false,
            secretKeyCiphertext,
            secretKeyIV,
            secretKeyTag,
            secretValueCiphertext,
            secretValueIV,
            secretValueTag
        }))
    });

    const addAction = await EELogService.createAction({
        name: ACTION_ADD_SECRETS,
        userId: req.user?._id,
        serviceAccountId: req.serviceAccount?._id,
        serviceTokenDataId: req.serviceTokenData?._id,
        workspaceId: new Types.ObjectId(workspaceId),
        secretIds: newlyCreatedSecrets.map((n) => n._id)
    });

    // (EE) create (audit) log
    addAction && await EELogService.createLog({
        userId: req.user?._id,
        serviceAccountId: req.serviceAccount?._id,
        serviceTokenDataId: req.serviceTokenData?._id,
        workspaceId: new Types.ObjectId(workspaceId),
        actions: [addAction],
        channel,
        ipAddress: req.ip
    });

    // (EE) take a secret snapshot
    await EESecretService.takeSecretSnapshot({
        workspaceId: new Types.ObjectId(workspaceId)
    });

    const postHogClient = TelemetryService.getPostHogClient();
    if (postHogClient) {
        postHogClient.capture({
            event: 'secrets added',
            distinctId: await TelemetryService.getDistinctId({
                authData: req.authData
            }),
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

    const { tagSlugs } = req.query;
    const workspaceId = req.query.workspaceId as string;
    const environment = req.query.environment as string;

    // secrets to return 
    let secrets: ISecret[] = [];

    // query tags table to get all tags ids for the tag names for the given workspace
    let tagIds = [];
    const tagNamesList = typeof tagSlugs === 'string' && tagSlugs !== '' ? tagSlugs.split(',') : [];
    if (tagNamesList != undefined && tagNamesList.length != 0) {
        const workspaceFromDB = await Tag.find({ workspace: workspaceId });
        tagIds = _.map(tagNamesList, (tagName) => {
            const tag = _.find(workspaceFromDB, { slug: tagName });
            return tag ? tag.id : null;
        });
    }

    if (req.user) {
        // case: client authorization is via JWT
        const hasWriteOnlyAccess = await userHasWriteOnlyAbility(req.user._id, new Types.ObjectId(workspaceId), environment)
        const hasNoAccess = await userHasNoAbility(req.user._id, new Types.ObjectId(workspaceId), environment)
        if (hasNoAccess) {
            throw UnauthorizedRequestError({ message: "You do not have the necessary permission(s) perform this action" })
        }

        const secretQuery: any = {
            workspace: workspaceId,
            environment,
            $or: [
                { user: req.user._id }, // personal secrets for this user
                { user: { $exists: false } } // shared secrets from workspace
            ]
        }

        if (tagIds.length > 0) {
            secretQuery.tags = { $in: tagIds };
        }

        if (hasWriteOnlyAccess) {
            // only return the secret keys and not the values since user does not have right to see values
            secrets = await Secret.find(secretQuery).select("secretKeyCiphertext secretKeyIV secretKeyTag").populate("tags")
        } else {
            secrets = await Secret.find(secretQuery).populate("tags")
        }
    }

    // case: client authorization is via service token
    if (req.serviceTokenData) {
        const userId = req.serviceTokenData.user;

        const secretQuery: any = {
            workspace: workspaceId,
            environment,
            $or: [
                { user: userId }, // personal secrets for this user
                { user: { $exists: false } } // shared secrets from workspace
            ]
        }

        if (tagIds.length > 0) {
            secretQuery.tags = { $in: tagIds };
        }

        // TODO check if service token has write only permission 

        secrets = await Secret.find(secretQuery).populate("tags");
    }

    // case: client authorization is via service account
    if (req.serviceAccount) {
        const secretQuery: any = {
            workspace: workspaceId,
            environment,
            user: { $exists: false } // shared secrets only from workspace
        }

        if (tagIds.length > 0) {
            secretQuery.tags = { $in: tagIds };
        }

        secrets = await Secret.find(secretQuery).populate("tags");
    }

    const channel = getChannelFromUserAgent(req.headers['user-agent'])

    const readAction = await EELogService.createAction({
        name: ACTION_READ_SECRETS,
        userId: req.user?._id,
        serviceAccountId: req.serviceAccount?._id,
        serviceTokenDataId: req.serviceTokenData?._id,
        workspaceId: new Types.ObjectId(workspaceId as string),
        secretIds: secrets.map((n: any) => n._id)
    });

    readAction && await EELogService.createLog({
        userId: req.user?._id,
        serviceAccountId: req.serviceAccount?._id,
        serviceTokenDataId: req.serviceTokenData?._id,
        workspaceId: new Types.ObjectId(workspaceId as string),
        actions: [readAction],
        channel,
        ipAddress: req.ip
    });

    const postHogClient = TelemetryService.getPostHogClient();
    if (postHogClient) {
        postHogClient.capture({
            event: 'secrets pulled',
            distinctId: await TelemetryService.getDistinctId({
                authData: req.authData
            }),
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
                        secretCommentCiphertext !== undefined &&
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
                    workspaceId: new Types.ObjectId(key)
                })
            });
        }, 10000);

        const updateAction = await EELogService.createAction({
            name: ACTION_UPDATE_SECRETS,
            userId: req.user?._id,
            serviceAccountId: req.serviceAccount?._id,
            serviceTokenDataId: req.serviceTokenData?._id,
            workspaceId: new Types.ObjectId(key),
            secretIds: workspaceSecretObj[key].map((secret: ISecret) => secret._id)
        });

        // (EE) create (audit) log
        updateAction && await EELogService.createLog({
            userId: req.user?._id,
            serviceAccountId: req.serviceAccount?._id,
            serviceTokenDataId: req.serviceTokenData?._id,
            workspaceId: new Types.ObjectId(key),
            actions: [updateAction],
            channel,
            ipAddress: req.ip
        });

        // (EE) take a secret snapshot
        await EESecretService.takeSecretSnapshot({
            workspaceId: new Types.ObjectId(key)
        })

        const postHogClient = TelemetryService.getPostHogClient();
        if (postHogClient) {
            postHogClient.capture({
                event: 'secrets modified',
                distinctId: await TelemetryService.getDistinctId({
                    authData: req.authData
                }),
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
 * Delete secret(s)
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
                workspaceId: new Types.ObjectId(key)
            })
        });
        const deleteAction = await EELogService.createAction({
            name: ACTION_DELETE_SECRETS,
            userId: req.user?._id,
            serviceAccountId: req.serviceAccount?._id,
            serviceTokenDataId: req.serviceTokenData?._id,
            workspaceId: new Types.ObjectId(key),
            secretIds: workspaceSecretObj[key].map((secret: ISecret) => secret._id)
        });

        // (EE) create (audit) log
        deleteAction && await EELogService.createLog({
            userId: req.user?._id,
            serviceAccountId: req.serviceAccount?._id,
            serviceTokenDataId: req.serviceTokenData?._id,
            workspaceId: new Types.ObjectId(key),
            actions: [deleteAction],
            channel,
            ipAddress: req.ip
        });

        // (EE) take a secret snapshot
        await EESecretService.takeSecretSnapshot({
            workspaceId: new Types.ObjectId(key)
        });

        const postHogClient = TelemetryService.getPostHogClient();
        if (postHogClient) {
            postHogClient.capture({
                event: 'secrets deleted',
                distinctId: await TelemetryService.getDistinctId({
                    authData: req.authData
                }),
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