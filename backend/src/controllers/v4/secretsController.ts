import { Request, Response } from "express";
import { Types } from "mongoose";
import { EventService } from "../../services";
import { eventPushSecrets } from "../../events";
import { ProjectPermissionActions } from "../../ee/services/ProjectRoleService";
import { checkSecretsPermission } from "../../helpers";
import { validateRequest } from "../../helpers/validation";
import * as reqValidator from "../../validation/secrets";

// TODO: find place to put endpoint spec

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

    // secrets
    return res.status(200).send({
        secrets: []
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

    return res.status(200).send({
        secret: ""
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

    await EventService.handleEvent({
        event: eventPushSecrets({
            workspaceId: new Types.ObjectId(projectId),
            environment: environmentSlug,
            secretPath: path
        })
    });

    return res.status(200).send({
        secret: ""
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
    } = await validateRequest(reqValidator.CreateSecretV4, req);

    const { membership } = await checkSecretsPermission({
        authData: req.authData,
        workspaceId: projectId,
        environment: environmentSlug,
        secretPath: path,
        secretAction: ProjectPermissionActions.Edit
    });

    await EventService.handleEvent({
        event: eventPushSecrets({
            workspaceId: new Types.ObjectId(projectId),
            environment: environmentSlug,
            secretPath: path
        })
    });

    return res.status(200).send({
        secret: ""
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

    const { membership } = await checkSecretsPermission({
        authData: req.authData,
        workspaceId: projectId,
        environment: environmentSlug,
        secretPath: path,
        secretAction: ProjectPermissionActions.Delete
    });

    await EventService.handleEvent({
        event: eventPushSecrets({
            workspaceId: new Types.ObjectId(projectId),
            environment: environmentSlug,
            secretPath: path
        })
    });

    return res.status(200).send({
        secret: ""
    });
}