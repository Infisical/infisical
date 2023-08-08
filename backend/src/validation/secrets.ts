import { Types } from "mongoose";
import {
    ISecret,
    IServiceTokenData,
    IUser,
    Secret,
} from "../models";
import { validateUserClientForSecret, validateUserClientForSecrets } from "./user";
import { validateServiceTokenDataClientForSecrets, validateServiceTokenDataClientForWorkspace } from "./serviceTokenData";
import {
    BadRequestError,
    SecretNotFoundError,
} from "../utils/errors";
import { AuthData } from "../interfaces/middleware";
import { ActorType } from "../ee/models";

/**
 * Validate authenticated clients for secrets with id [secretId] based
 * on any known permissions.
 * @param {Object} obj
 * @param {Object} obj.authData - authenticated client details
 * @param {Types.ObjectId} obj.secretId - id of secret to validate against
 * @param {Array<'admin' | 'member'>} obj.acceptedRoles - accepted workspace roles
 * @param {String[]} obj.requiredPermissions - required permissions as part of the endpoint
 */
export const validateClientForSecret = async ({
    authData,
    secretId,
    acceptedRoles,
    requiredPermissions,
}: {
    authData: AuthData;
    secretId: Types.ObjectId;
    acceptedRoles: Array<"admin" | "member">;
    requiredPermissions: string[];
}) => {
    const secret = await Secret.findById(secretId);

    if (!secret) throw SecretNotFoundError({
        message: "Failed to find secret",
    });
    
    switch (authData.actor.type) {
        case ActorType.USER:
            await validateUserClientForSecret({
                user: authData.authPayload as IUser,
                secret,
                acceptedRoles,
                requiredPermissions,
            });

            return secret;
        case ActorType.SERVICE:
            await validateServiceTokenDataClientForWorkspace({
                serviceTokenData: authData.authPayload as IServiceTokenData,
                workspaceId: secret.workspace,
                environment: secret.environment,
            });
        
            return secret;
    }
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
export const validateClientForSecrets = async ({
    authData,
    secretIds,
    requiredPermissions,
}: {
    authData: AuthData;
    secretIds: Types.ObjectId[];
    requiredPermissions: string[];
}) => {

    let secrets: ISecret[] = [];
    
    secrets = await Secret.find({
        _id: {
            $in: secretIds,
        },
    });

    if (secrets.length != secretIds.length) {
        throw BadRequestError({ message: "Failed to validate non-existent secrets" })
    }
    
    switch (authData.actor.type) {
        case ActorType.USER:
            await validateUserClientForSecrets({
                user: authData.authPayload as IUser,
                secrets,
                requiredPermissions,
            });
            
            return secrets;
        case ActorType.SERVICE:
            await validateServiceTokenDataClientForSecrets({
                serviceTokenData: authData.authPayload as IServiceTokenData,
                secrets,
                requiredPermissions,
            });
            
            return secrets;
    }
}