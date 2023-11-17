import { Request, Response } from "express";
import { Types } from "mongoose";
import { BotService, SecretService } from "../../services";
import { getAllImportedSecrets } from "../../services/SecretImportService";
import { encryptSymmetric128BitHexKeyUTF8 } from "../../utils/crypto";
import { ProjectPermissionActions } from "../../ee/services/ProjectRoleService";
import { checkSecretsPermission, packageSecretV4 } from "../../helpers";
import { validateRequest } from "../../helpers/validation";
import * as reqValidator from "../../validation/secrets";
import { getFolderIdFromServiceToken } from "../../services/FolderService";

/**
 * Get secrets in project with id
 * [projectId]under path [path]
 * @param req 
 * @param res 
 * @returns 
 */
export const getSecrets = async (req: Request, res: Response) => {
    const {
        query: {
            projectId,
            environmentSlug,
            path,
            includeImports
        }
    } = await validateRequest(reqValidator.GetSecretsV4, req);

    await checkSecretsPermission({
        authData: req.authData,
        workspaceId: projectId,
        environment: environmentSlug,
        secretPath: path,
        secretAction: ProjectPermissionActions.Read
    });

    const secrets = await SecretService.getSecrets({
        workspaceId: new Types.ObjectId(projectId),
        environment: environmentSlug,
        secretPath: path,
        authData: req.authData
    });

    const key = await BotService.getWorkspaceKeyWithBot({
        workspaceId: new Types.ObjectId(projectId)
    });

    let packagedSecrets = secrets.map((secret) => packageSecretV4({
        secret,
        key
    }));
    
    const folderId = await getFolderIdFromServiceToken(projectId, environmentSlug, path);
    
    if (includeImports) {
        const importGroups = await getAllImportedSecrets(
            projectId,
            environmentSlug,
            folderId,
            () => true
        );
        
        importGroups.forEach((importGroup) => {
            packagedSecrets = packagedSecrets.concat(
                importGroup.secrets.map((secret) => packageSecretV4({ secret, key }))
            );
        });
    }

    return res.status(200).send({
        secrets: packagedSecrets
    });
}

/**
 * Get secret named [secretName] in project with id
 * [projectId]under path [path]
 * @param req 
 * @param res 
 * @returns 
 */
export const getSecret = async (req: Request, res: Response) => {
    const {
        params: {
            secretName
        },
        query: {
            projectId,
            environmentSlug,
            path,
            type,
            includeImports
        }
    } = await validateRequest(reqValidator.GetSecretV4, req);

    await checkSecretsPermission({
        authData: req.authData,
        workspaceId: projectId,
        environment: environmentSlug,
        secretPath: path,
        secretAction: ProjectPermissionActions.Read
    });
    
    const secret = await SecretService.getSecret({
        secretName,
        workspaceId: new Types.ObjectId(projectId),
        environment: environmentSlug,
        type,
        secretPath: path,
        authData: req.authData,
        include_imports: includeImports
    });

    const key = await BotService.getWorkspaceKeyWithBot({
        workspaceId: new Types.ObjectId(projectId)
    });
    
    const packagedSecret = packageSecretV4({
        secret,
        key
    });

    return res.status(200).send({
        secret: packagedSecret
    });
}

/**
 * Create secret named [secretName] in project with id
 * [projectId]under path [path]
 * @param req 
 * @param res 
 * @returns 
 */
export const createSecret = async (req: Request, res: Response) =>{
    const {
        params: {
            secretName
        },
        body: {
            projectId,
            environmentSlug,
            path,
            type,
            secretValue,
            secretComment,
            skipMultilineEncoding
        }
    } = await validateRequest(reqValidator.CreateSecretV4, req);
    
    await checkSecretsPermission({
        authData: req.authData,
        workspaceId: projectId,
        environment: environmentSlug,
        secretPath: path,
        secretAction: ProjectPermissionActions.Create
    });

    const key = await BotService.getWorkspaceKeyWithBot({
        workspaceId: new Types.ObjectId(projectId)
    });

    const { 
        ciphertext: secretKeyCiphertext,
        iv: secretKeyIV, 
        tag: secretKeyTag
    } = encryptSymmetric128BitHexKeyUTF8({
        plaintext: secretName,
        key
    });

    const { 
        ciphertext: secretValueCiphertext,
        iv: secretValueIV,
        tag: secretValueTag
    } = encryptSymmetric128BitHexKeyUTF8({
        plaintext: secretValue,
        key
    });

    const { 
        ciphertext: secretCommentCiphertext,
        iv: secretCommentIV,
        tag: secretCommentTag
    } = encryptSymmetric128BitHexKeyUTF8({
        plaintext: secretComment,
        key
    });

    const secret = await SecretService.createSecret({
        secretName,
        workspaceId: new Types.ObjectId(projectId),
        environment: environmentSlug,
        type,
        authData: req.authData,
        secretKeyCiphertext,
        secretKeyIV,
        secretKeyTag,
        secretValueCiphertext,
        secretValueIV,
        secretValueTag,
        secretPath: path,
        secretCommentCiphertext,
        secretCommentIV,
        secretCommentTag,
        skipMultilineEncoding
    });

    const packagedSecret = packageSecretV4({
        secret,
        key
    });

    return res.status(200).send({
        secret: packagedSecret
    });
}

/**
 * Create secret named [secretName] in project with id
 * [projectId]under path [path]
 * @param req 
 * @param res 
 * @returns 
 */
export const updateSecret = async (req: Request, res: Response) => {
    const {
        params: {
            secretName
        },
        body: {
            projectId,
            environmentSlug,
            path,
            type,
            secretValue,
            secretComment,
            skipMultilineEncoding
        }
    } = await validateRequest(reqValidator.UpdateSecretV4, req);

    await checkSecretsPermission({
        authData: req.authData,
        workspaceId: projectId,
        environment: environmentSlug,
        secretPath: path,
        secretAction: ProjectPermissionActions.Edit
    });

    const key = await BotService.getWorkspaceKeyWithBot({
        workspaceId: new Types.ObjectId(projectId)
    });
    
    let secretValueCiphertext, secretValueIV, secretValueTag;
    if (secretValue) {
        const { ciphertext, iv, tag } = encryptSymmetric128BitHexKeyUTF8({
            plaintext: secretValue,
            key
        });

        secretValueCiphertext = ciphertext;
        secretValueIV = iv;
        secretValueTag = tag;
    }

    let secretCommentCiphertext, secretCommentIV, secretCommentTag;
    if (secretComment) {
        const { ciphertext, iv, tag } = encryptSymmetric128BitHexKeyUTF8({
            plaintext: secretComment,
            key
        });

        secretCommentCiphertext = ciphertext;
        secretCommentIV = iv;
        secretCommentTag = tag;
    }

    const secret = await SecretService.updateSecret({
        secretName,
        workspaceId: new Types.ObjectId(projectId),
        environment: environmentSlug,
        type,
        authData: req.authData,
        secretValueCiphertext,
        secretValueIV,
        secretValueTag,
        secretCommentCiphertext,
        secretCommentIV,
        secretCommentTag,
        secretPath: path,
        skipMultilineEncoding
    });

    const packagedSecret = packageSecretV4({
        secret,
        key
    });

    return res.status(200).send({
        secret: packagedSecret
    });
}

/**
 * Delete secret named [secretName] in project with id
 * [projectId]under path [path]
 * @param req 
 * @param res 
 * @returns 
 */
export const deleteSecret = async (req: Request, res: Response) => {
    const {
        params: {
            secretName
        },
        body: {
            projectId,
            environmentSlug,
            path,
            type
        }
    } = await validateRequest(reqValidator.DeleteSecretV4, req);

    await checkSecretsPermission({
        authData: req.authData,
        workspaceId: projectId,
        environment: environmentSlug,
        secretPath: path,
        secretAction: ProjectPermissionActions.Delete
    });
    
    const key = await BotService.getWorkspaceKeyWithBot({
        workspaceId: new Types.ObjectId(projectId)
    });

    const { secret } = await SecretService.deleteSecret({
        secretName,
        workspaceId: new Types.ObjectId(projectId),
        environment: environmentSlug,
        type,
        authData: req.authData,
        secretPath: path
    });
    
    const packagedSecret = packageSecretV4({
        secret,
        key
    });

    return res.status(200).send({
        secret: packagedSecret
    });
}