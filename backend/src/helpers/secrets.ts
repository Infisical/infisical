import { Types } from 'mongoose';
import {
    CreateSecretParams,
    GetSecretsParams,
    GetSecretParams,
    UpdateSecretParams,
    DeleteSecretParams
} from '../interfaces/services/SecretService';
import {
    AuthData
} from '../interfaces/middleware';
import {
    User,
    Workspace,
    ServiceAccount,
    ServiceTokenData,
    Secret,
    ISecret,
    SecretBlindIndexData,
} from '../models';
import { SecretVersion } from '../ee/models';
import {
    validateMembership
} from '../helpers/membership';
import {
    validateUserClientForSecret,
    validateUserClientForSecrets
} from '../helpers/user';
import {
    validateServiceTokenDataClientForSecrets, 
    validateServiceTokenDataClientForWorkspace
} from '../helpers/serviceTokenData';
import {
    validateServiceAccountClientForSecrets,
    validateServiceAccountClientForWorkspace
} from '../helpers/serviceAccount';
import { 
    BadRequestError, 
    UnauthorizedRequestError,
    SecretNotFoundError,
    SecretBlindIndexDataNotFoundError
} from '../utils/errors';
import {
    AUTH_MODE_JWT,
    AUTH_MODE_SERVICE_ACCOUNT,
    AUTH_MODE_SERVICE_TOKEN,
    AUTH_MODE_API_KEY,
    SECRET_PERSONAL,
    SECRET_SHARED,
    ACTION_ADD_SECRETS,
    ACTION_READ_SECRETS,
    ACTION_UPDATE_SECRETS,
    ACTION_DELETE_SECRETS
} from '../variables';
import crypto from 'crypto';
import * as argon2 from 'argon2';
import {
    encryptSymmetric128BitHexKeyUTF8,
    decryptSymmetric128BitHexKeyUTF8
} from '../utils/crypto';
import { getEncryptionKey } from '../config';
import { TelemetryService } from '../services';
import {
    EESecretService,
    EELogService
} from '../ee/services';
import {
    getAuthDataPayloadIdObj,
    getAuthDataPayloadUserObj
} from '../utils/auth';

/**
 * Validate authenticated clients for secrets with id [secretId] based
 * on any known permissions.
 * @param {Object} obj
 * @param {Object} obj.authData - authenticated client details
 * @param {Types.ObjectId} obj.secretId - id of secret to validate against
 * @param {Array<'admin' | 'member'>} obj.acceptedRoles - accepted workspace roles
 * @param {String[]} obj.requiredPermissions - required permissions as part of the endpoint
 */
const validateClientForSecret = async ({
    authData,
    secretId,
    acceptedRoles,
    requiredPermissions
}: {
    authData: AuthData;
    secretId: Types.ObjectId;
    acceptedRoles: Array<'admin' | 'member'>;
    requiredPermissions: string[];
}) => {
    const secret = await Secret.findById(secretId);

    if (!secret) throw SecretNotFoundError({
        message: 'Failed to find secret'
    });

    if (authData.authMode === AUTH_MODE_JWT && authData.authPayload instanceof User) {
        await validateUserClientForSecret({
            user: authData.authPayload,
            secret,
            acceptedRoles,
            requiredPermissions
        });

        return secret;
    }

    if (authData.authMode === AUTH_MODE_SERVICE_ACCOUNT && authData.authPayload instanceof ServiceAccount) {
        await validateServiceAccountClientForWorkspace({
            serviceAccount: authData.authPayload,
            workspaceId: secret.workspace,
            environment: secret.environment,
            requiredPermissions
        });
        
        return secret;
    }

    if (authData.authMode === AUTH_MODE_SERVICE_TOKEN && authData.authPayload instanceof ServiceTokenData) {
        await validateServiceTokenDataClientForWorkspace({
            serviceTokenData: authData.authPayload,
            workspaceId: secret.workspace,
            environment: secret.environment
        });
    
        return secret;
    }
    
    if (authData.authMode === AUTH_MODE_API_KEY && authData.authPayload instanceof User) {
        await validateUserClientForSecret({
            user: authData.authPayload,
            secret,
            acceptedRoles,
            requiredPermissions
        });

        return secret;
    }
    
    throw UnauthorizedRequestError({
        message: 'Failed client authorization for secret'
    });
}

/**
 * Validate authenticated clients for secrets with ids [secretIds] based
 * on any known permissions.
 * @param {Object} obj
 * @param {Object} obj.authData - authenticated client details
 * @param {Types.ObjectId[]} obj.secretIds - id of workspace to validate against
 * @param {String} obj.environment - (optional) environment in workspace to validate against
 * @param {Array<'admin' | 'member'>} obj.acceptedRoles - accepted workspace roles
 * @param {String[]} obj.requiredPermissions - required permissions as part of the endpoint
 */
const validateClientForSecrets = async ({
    authData,
    secretIds,
    requiredPermissions
}: {
    authData: AuthData;
    secretIds: Types.ObjectId[];
    requiredPermissions: string[];
}) => {

    let secrets: ISecret[] = [];
    
    secrets = await Secret.find({
        _id: {
            $in: secretIds
        }
    });

    if (secrets.length != secretIds.length) {
        throw BadRequestError({ message: 'Failed to validate non-existent secrets' })
    }

    if (authData.authMode === AUTH_MODE_JWT && authData.authPayload instanceof User) {
        await validateUserClientForSecrets({
            user: authData.authPayload,
            secrets,
            requiredPermissions
        });
        
        return secrets;
    }
    
    if (authData.authMode === AUTH_MODE_SERVICE_ACCOUNT && authData.authPayload instanceof ServiceAccount) {
        await validateServiceAccountClientForSecrets({
            serviceAccount: authData.authPayload,
            secrets,
            requiredPermissions
        });
        
        return secrets;
    }
        
    if (authData.authMode === AUTH_MODE_SERVICE_TOKEN && authData.authPayload instanceof ServiceTokenData) {
        await validateServiceTokenDataClientForSecrets({
            serviceTokenData: authData.authPayload,
            secrets,
            requiredPermissions
        });
        
        return secrets;
    }

    if (authData.authMode === AUTH_MODE_API_KEY && authData.authPayload instanceof User) {
        await validateUserClientForSecrets({
            user: authData.authPayload,
            secrets,
            requiredPermissions
        });
        
        return secrets;
    }

    throw UnauthorizedRequestError({
        message: 'Failed client authorization for secrets resource'
    });
}

/**
 * Create secret blind index data containing encrypted blind index [salt]
 * for workspace with id [workspaceId]
 * @param {Object} obj
 * @param {Types.ObjectId} obj.workspaceId
 */
const createSecretBlindIndexDataHelper = async ({
    workspaceId
}: {
    workspaceId: Types.ObjectId;
}) => {
    // initialize random blind index salt for workspace
    const salt = crypto.randomBytes(16).toString('base64');
    
    const { 
        ciphertext: encryptedSaltCiphertext,
        iv: saltIV,
        tag: saltTag
    } = encryptSymmetric128BitHexKeyUTF8({
        plaintext: salt,
        key: await getEncryptionKey()
    });
    
    const secretBlindIndexData = await new SecretBlindIndexData({
        workspace: workspaceId,
        encryptedSaltCiphertext,
        saltIV,
        saltTag
    }).save();
    
    return secretBlindIndexData;
}

/**
 * Get secret blind index salt for workspace with id [workspaceId]
 * @param {Object} obj
 * @param {Types.ObjectId} obj.workspaceId - id of workspace to get salt for
 * @returns 
 */
const getSecretBlindIndexSaltHelper = async ({
    workspaceId
}: {
    workspaceId: Types.ObjectId;
}) => {
    // check if workspace blind index data exists
    const secretBlindIndexData = await SecretBlindIndexData.findOne({
        workspace: workspaceId
    });
    
    if (!secretBlindIndexData) throw SecretBlindIndexDataNotFoundError();
    
    // decrypt workspace salt
    const salt = decryptSymmetric128BitHexKeyUTF8({
        ciphertext: secretBlindIndexData.encryptedSaltCiphertext,
        iv: secretBlindIndexData.saltIV,
        tag: secretBlindIndexData.saltTag,
        key: await getEncryptionKey()
    });
    
    return salt;
}

/**
 * Generate blind index for secret with name [secretName]
 * and salt [salt]
 * @param {Object} obj
 * @param {String} obj.secretName - name of secret to generate blind index for
 * @param {String} obj.salt - base64-salt
 */
 const generateSecretBlindIndexWithSaltHelper = async ({
    secretName,
    salt
}: {
    secretName: string;
    salt: string;
}) => {

    // generate secret blind index
    const secretBlindIndex = (await argon2.hash(secretName, {
        type: argon2.argon2id,
        salt: Buffer.from(salt, 'base64'),
        saltLength: 16, // default 16 bytes
        memoryCost: 65536, // default pool of 64 MiB per thread.
        hashLength: 32,
        parallelism: 1,
        raw: true
    })).toString('base64');

    return secretBlindIndex;
}

/**
 * Generate blind index for secret with name [secretName] 
 * for workspace with id [workspaceId]
 * @param {Object} obj
 * @param {Stringj} obj.secretName - name of secret to generate blind index for
 * @param {Types.ObjectId} obj.workspaceId - id of workspace that secret belongs to
 */
const generateSecretBlindIndexHelper = async ({
    secretName,
    workspaceId
}: {
    secretName: string;
    workspaceId: Types.ObjectId;
}) => {

    // check if workspace blind index data exists
    const secretBlindIndexData = await SecretBlindIndexData.findOne({
        workspace: workspaceId
    });
    
    if (!secretBlindIndexData) throw SecretBlindIndexDataNotFoundError();
    
    // decrypt workspace salt
    const salt = decryptSymmetric128BitHexKeyUTF8({
        ciphertext: secretBlindIndexData.encryptedSaltCiphertext,
        iv: secretBlindIndexData.saltIV,
        tag: secretBlindIndexData.saltTag,
        key: await getEncryptionKey()
    });

    const secretBlindIndex = await generateSecretBlindIndexWithSaltHelper({
        secretName,
        salt
    });

    return secretBlindIndex;
}

/**
 * Create secret with name [secretName]
 * @param {Object} obj
 * @param {String} obj.secretName - name of secret to create
 * @param {Types.ObjectId} obj.workspaceId - id of workspace to create secret for
 * @param {String} obj.environment - environment in workspace to create secret for
 * @param {'shared' | 'personal'} obj.type - type of secret
 * @param {AuthData} obj.authData - authentication data on request
 * @returns 
 */
const createSecretHelper = async ({
    secretName,
    workspaceId,
    environment,
    type,
    authData,
    secretKeyCiphertext,
    secretKeyIV,
    secretKeyTag,
    secretValueCiphertext,
    secretValueIV,
    secretValueTag,
    secretCommentCiphertext,
    secretCommentIV,
    secretCommentTag
}: CreateSecretParams) => {
    const secretBlindIndex = await generateSecretBlindIndexHelper({
        secretName,
        workspaceId: new Types.ObjectId(workspaceId)
    });

    const exists = await Secret.exists({
        secretBlindIndex,
        workspace: new Types.ObjectId(workspaceId),
        type,
        ...(type === SECRET_PERSONAL ? getAuthDataPayloadUserObj(authData) : {})
    });
    
    if (exists) throw BadRequestError({
        message: 'Failed to create secret that already exists'
    });
    
    if (type === SECRET_PERSONAL) {
        // case: secret type is personal -> check if a corresponding shared secret 
        // with the same blind index [secretBlindIndex] exists

        const exists = await Secret.exists({
            secretBlindIndex,
            workspace: new Types.ObjectId(workspaceId),
            type: SECRET_SHARED
        });
        
        if (!exists) throw BadRequestError({
            message: 'Failed to create personal secret override for no corresponding shared secret'
        });
    }
    
    // create secret
    const secret = await new Secret({
        version: 1,
        workspace: new Types.ObjectId(workspaceId),
        environment,
        type,
        ...(type === SECRET_PERSONAL ? getAuthDataPayloadUserObj(authData) : {}),
        secretBlindIndex,
        secretKeyCiphertext,
        secretKeyIV,
        secretKeyTag,
        secretValueCiphertext,
        secretValueIV,
        secretValueTag,
        secretCommentCiphertext,
        secretCommentIV,
        secretCommentTag
    }).save();
    
    const secretVersion = new SecretVersion({
        secret: secret._id,
        version: secret.version,
        workspace: secret.workspace,
        type,
        ...(type === SECRET_PERSONAL ? getAuthDataPayloadUserObj(authData) : {}),
        environment: secret.environment,
        isDeleted: false,
        secretBlindIndex,
        secretKeyCiphertext,
        secretKeyIV,
        secretKeyTag,
        secretValueCiphertext,
        secretValueIV,
        secretValueTag
    });

    // // (EE) add version for new secret
    await EESecretService.addSecretVersions({
        secretVersions: [secretVersion]
    });

    // (EE) create (audit) log
    const action = await EELogService.createAction({
        name: ACTION_ADD_SECRETS,
        ...getAuthDataPayloadIdObj(authData),
        workspaceId,
        secretIds: [secret._id]
    });
    
    action && await EELogService.createLog({
        ...getAuthDataPayloadIdObj(authData),
        workspaceId,
        actions: [action],
        channel: authData.authChannel,
        ipAddress: authData.authIP
    });
    
    // (EE) take a secret snapshot
    await EESecretService.takeSecretSnapshot({
        workspaceId
    });

    const postHogClient = await TelemetryService.getPostHogClient();

    if (postHogClient) {
        postHogClient.capture({
            event: 'secrets added',
            distinctId: await TelemetryService.getDistinctId({
                authData
            }),
            properties: {
                numberOfSecrets: 1,
                environment,
                workspaceId,
                channel: authData.authChannel,
                userAgent: authData.authUserAgent
            }
        });
    }
    
    return secret;
}

/**
 * Get secrets for workspace with id [workspaceId] and environment [environment]
 * @param {Object} obj
 * @param {Types.ObjectId} obj.workspaceId - id of workspace
 * @param {String} obj.environment - environment in workspace
 * @param {AuthData} obj.authData - authentication data on request
 * @returns 
 */
const getSecretsHelper = async ({
    workspaceId,
    environment,
    authData
}: GetSecretsParams) => {
    let secrets: ISecret[] = [];

    // get personal secrets first
    secrets = await Secret.find({
        workspace: new Types.ObjectId(workspaceId),
        environment,
        type: SECRET_PERSONAL,
        ...getAuthDataPayloadUserObj(authData)
    });

    // concat with shared secrets
    secrets = secrets.concat(await Secret.find({
        workspace: new Types.ObjectId(workspaceId),
        environment,
        type: SECRET_SHARED,
        secretBlindIndex: {
            $nin: secrets.map((secret) => secret.secretBlindIndex)
        }
    }));

    // (EE) create (audit) log
    const action = await EELogService.createAction({
        name: ACTION_READ_SECRETS,
        ...getAuthDataPayloadIdObj(authData),
        workspaceId,
        secretIds: secrets.map((secret) => secret._id)
    });
    
    action && await EELogService.createLog({
        ...getAuthDataPayloadIdObj(authData),
        workspaceId,
        actions: [action],
        channel: authData.authChannel,
        ipAddress: authData.authIP
    });

    const postHogClient = await TelemetryService.getPostHogClient();

    if (postHogClient) {
        postHogClient.capture({
            event: 'secrets pulled',
            distinctId: await TelemetryService.getDistinctId({
                authData
            }),
            properties: {
                numberOfSecrets: secrets.length,
                environment,
                workspaceId,
                channel: authData.authChannel,
                userAgent: authData.authUserAgent
            }
        });
    }

    return secrets;
}

/**
 * Get secret with name [secretName]
 * @param {Object} obj
 * @param {String} obj.secretName - name of secret to get
 * @param {Types.ObjectId} obj.workspaceId - id of workspace that secret belongs to
 * @param {String} obj.environment - environment in workspace that secret belongs to
 * @param {'shared' | 'personal'} obj.type - type of secret
 * @param {AuthData} obj.authData - authentication data on request
 * @returns 
 */
const getSecretHelper = async ({
    secretName,
    workspaceId,
    environment,
    type,
    authData
}: GetSecretParams) => {
    const secretBlindIndex = await generateSecretBlindIndexHelper({
        secretName,
        workspaceId: new Types.ObjectId(workspaceId)
    });
    let secret: ISecret | null = null;
    
    // try getting personal secret first (if exists)
    secret = await Secret.findOne({
        secretBlindIndex,
        workspace: new Types.ObjectId(workspaceId),
        environment,
        type: type ?? SECRET_PERSONAL,
        ...(type === SECRET_PERSONAL ? getAuthDataPayloadUserObj(authData) : {})
    });

    if (!secret) {
        // case: failed to find personal secret matching criteria
        // -> find shared secret matching criteria
        secret = await Secret.findOne({
            secretBlindIndex,
            workspace: new Types.ObjectId(workspaceId),
            environment,
            type: SECRET_SHARED
        });
    }
    
    if (!secret) throw SecretNotFoundError();
    
    // (EE) create (audit) log
    const action = await EELogService.createAction({
        name: ACTION_READ_SECRETS,
        ...getAuthDataPayloadIdObj(authData),
        workspaceId,
        secretIds: [secret._id]
    });
    
    action && await EELogService.createLog({
        ...getAuthDataPayloadIdObj(authData),
        workspaceId,
        actions: [action],
        channel: authData.authChannel,
        ipAddress: authData.authIP
    });

    const postHogClient = await TelemetryService.getPostHogClient();

    if (postHogClient) {
        postHogClient.capture({
            event: 'secrets pull',
            distinctId: await TelemetryService.getDistinctId({
                authData
            }),
            properties: {
                numberOfSecrets: 1,
                environment,
                workspaceId,
                channel: authData.authChannel,
                userAgent: authData.authUserAgent
            }
        });
    }

    return secret;
}

/**
 * Update secret with name [secretName]
 * @param {Object} obj
 * @param {String} obj.secretName - name of secret to update
 * @param {Types.ObjectId} obj.workspaceId - id of workspace that secret belongs to
 * @param {String} obj.environment - environment in workspace that secret belongs to
 * @param {'shared' | 'personal'} obj.type - type of secret
 * @param {String} obj.secretValueCiphertext - ciphertext of secret value
 * @param {String} obj.secretValueIV - IV of secret value
 * @param {String} obj.secretValueTag - tag of secret value
 * @param {AuthData} obj.authData - authentication data on request
 * @returns 
 */
const updateSecretHelper = async ({
    secretName,
    workspaceId,
    environment,
    type,
    authData,
    secretValueCiphertext,
    secretValueIV,
    secretValueTag
}: UpdateSecretParams) => {
    const secretBlindIndex = await generateSecretBlindIndexHelper({
        secretName,
        workspaceId: new Types.ObjectId(workspaceId)
    });

    let secret: ISecret | null = null;
    
    if (type === SECRET_SHARED) {
        // case: update shared secret
        secret = await Secret.findOneAndUpdate(
            {
                secretBlindIndex,
                workspace: new Types.ObjectId(workspaceId),
                environment,
                type
            },
            {
                secretValueCiphertext,
                secretValueIV,
                secretValueTag,
                $inc: { version: 1 }
            },
            {
                new: true
            }
        );
    } else {
        // case: update personal secret
        
        secret = await Secret.findOneAndUpdate(
            {
                secretBlindIndex,
                workspace: new Types.ObjectId(workspaceId),
                environment,
                type,
                ...getAuthDataPayloadUserObj(authData)
            },
            {
                secretValueCiphertext,
                secretValueIV,
                secretValueTag,
                $inc: { version: 1 }
            },
            {
                new: true
            }
        );
    }

    if (!secret) throw SecretNotFoundError();

    const secretVersion = new SecretVersion({
        secret: secret._id,
        version: secret.version,
        workspace: secret.workspace,
        type,
        ...(type === SECRET_PERSONAL ? getAuthDataPayloadUserObj(authData) : {}),
        environment: secret.environment,
        isDeleted: false,
        secretBlindIndex,
        secretKeyCiphertext: secret.secretKeyCiphertext,
        secretKeyIV: secret.secretKeyIV,
        secretKeyTag: secret.secretKeyTag,
        secretValueCiphertext,
        secretValueIV,
        secretValueTag
    });

    // (EE) add version for new secret
    await EESecretService.addSecretVersions({
        secretVersions: [secretVersion]
    });

    // (EE) create (audit) log
    const action = await EELogService.createAction({
        name: ACTION_UPDATE_SECRETS,
        ...getAuthDataPayloadIdObj(authData),
        workspaceId,
        secretIds: [secret._id]
    });
    
    action && await EELogService.createLog({
        ...getAuthDataPayloadIdObj(authData),
        workspaceId,
        actions: [action],
        channel: authData.authChannel,
        ipAddress: authData.authIP
    });
    
    // (EE) take a secret snapshot
    await EESecretService.takeSecretSnapshot({
        workspaceId
    });

    const postHogClient = await TelemetryService.getPostHogClient();

    if (postHogClient) {
        postHogClient.capture({
            event: 'secrets modified',
            distinctId: await TelemetryService.getDistinctId({
                authData
            }),
            properties: {
                numberOfSecrets: 1,
                environment,
                workspaceId,
                channel: authData.authChannel,
                userAgent: authData.authUserAgent
            }
        });
    }

    return secret;
}

/**
 * Delete secret with name [secretName]
 * @param {Object} obj
 * @param {String} obj.secretName - name of secret to delete
 * @param {Types.ObjectId} obj.workspaceId - id of workspace that secret belongs to
 * @param {String} obj.environment - environment in workspace that secret belongs to
 * @param {'shared' | 'personal'} obj.type - type of secret
 * @param {AuthData} obj.authData - authentication data on request
 * @returns 
 */
const deleteSecretHelper = async ({
    secretName,
    workspaceId,
    environment,
    type,
    authData
}: DeleteSecretParams) => {
    const secretBlindIndex = await generateSecretBlindIndexHelper({
        secretName,
        workspaceId: new Types.ObjectId(workspaceId)
    });

    let secrets: ISecret[] = [];
    let secret: ISecret | null = null;
    
    if (type === SECRET_SHARED) {
        secrets = await Secret.find({
            secretBlindIndex,
            workspaceId: new Types.ObjectId(workspaceId),
            environment
        });
        
        secret = await Secret.findOneAndDelete({
            secretBlindIndex,
            workspaceId: new Types.ObjectId(workspaceId),
            environment,
            type
        });
        
        await Secret.deleteMany({
            secretBlindIndex,
            workspaceId: new Types.ObjectId(workspaceId),
            environment
        });
    } else {
        secret = await Secret.findOneAndDelete({
            secretBlindIndex,
            workspaceId: new Types.ObjectId(workspaceId),
            environment,
            type,
            ...getAuthDataPayloadUserObj(authData)
        });
        
        if (secret) {
            secrets = [secret];
        }
    }
    
    if (!secret) throw SecretNotFoundError();
    
    await EESecretService.markDeletedSecretVersions({
        secretIds: secrets.map((secret) => secret._id)
    });

    // (EE) create (audit) log
    const action = await EELogService.createAction({
        name: ACTION_DELETE_SECRETS,
        ...getAuthDataPayloadIdObj(authData),
        workspaceId,
        secretIds: secrets.map((secret) => secret._id)
    });

    // (EE) take a secret snapshot
    action && await EELogService.createLog({
        ...getAuthDataPayloadIdObj(authData),
        workspaceId,
        actions: [action],
        channel: authData.authChannel,
        ipAddress: authData.authIP
    });

    // (EE) take a secret snapshot
    await EESecretService.takeSecretSnapshot({
        workspaceId
    });

    const postHogClient = await TelemetryService.getPostHogClient();

    if (postHogClient) {
        postHogClient.capture({
            event: 'secrets deleted',
            distinctId: await TelemetryService.getDistinctId({
                authData
            }),
            properties: {
                numberOfSecrets: secrets.length,
                environment,
                workspaceId,
                channel: authData.authChannel,
                userAgent: authData.authUserAgent
            }
        });
    }
    
    return ({
        secrets,
        secret
    });
}

export {
    validateClientForSecret,
    validateClientForSecrets,
    createSecretBlindIndexDataHelper,
    getSecretBlindIndexSaltHelper,
    generateSecretBlindIndexWithSaltHelper,
    generateSecretBlindIndexHelper,
    createSecretHelper,
    getSecretsHelper,
    getSecretHelper,
    updateSecretHelper,
    deleteSecretHelper
}