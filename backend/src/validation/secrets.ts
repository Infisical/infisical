import { Types } from "mongoose";
import {
    ISecret,
    Secret,
    ServiceAccount,
    ServiceTokenData,
    User,
} from "../models";
import { validateServiceAccountClientForSecrets, validateServiceAccountClientForWorkspace } from "./serviceAccount";
import { validateUserClientForSecret, validateUserClientForSecrets } from "./user";
import { validateServiceTokenDataClientForSecrets, validateServiceTokenDataClientForWorkspace } from "./serviceTokenData";
import { AuthData } from "../interfaces/middleware";
import {
    BadRequestError,
    SecretNotFoundError,
    UnauthorizedRequestError,
} from "../utils/errors";
import {
    AUTH_MODE_API_KEY,
    AUTH_MODE_JWT,
    AUTH_MODE_SERVICE_ACCOUNT,
    AUTH_MODE_SERVICE_TOKEN,
} from "../variables";

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

    if (authData.authMode === AUTH_MODE_JWT && authData.authPayload instanceof User) {
        await validateUserClientForSecret({
            user: authData.authPayload,
            secret,
            acceptedRoles,
            requiredPermissions,
        });

        return secret;
    }

    if (authData.authMode === AUTH_MODE_SERVICE_ACCOUNT && authData.authPayload instanceof ServiceAccount) {
        await validateServiceAccountClientForWorkspace({
            serviceAccount: authData.authPayload,
            workspaceId: secret.workspace,
            environment: secret.environment,
            requiredPermissions,
        });
        
        return secret;
    }

    if (authData.authMode === AUTH_MODE_SERVICE_TOKEN && authData.authPayload instanceof ServiceTokenData) {
        await validateServiceTokenDataClientForWorkspace({
            serviceTokenData: authData.authPayload,
            workspaceId: secret.workspace,
            environment: secret.environment,
        });
    
        return secret;
    }
    
    if (authData.authMode === AUTH_MODE_API_KEY && authData.authPayload instanceof User) {
        await validateUserClientForSecret({
            user: authData.authPayload,
            secret,
            acceptedRoles,
            requiredPermissions,
        });

        return secret;
    }
    
    throw UnauthorizedRequestError({
        message: "Failed client authorization for secret",
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

    if (authData.authMode === AUTH_MODE_JWT && authData.authPayload instanceof User) {
        await validateUserClientForSecrets({
            user: authData.authPayload,
            secrets,
            requiredPermissions,
        });
        
        return secrets;
    }
    
    if (authData.authMode === AUTH_MODE_SERVICE_ACCOUNT && authData.authPayload instanceof ServiceAccount) {
        await validateServiceAccountClientForSecrets({
            serviceAccount: authData.authPayload,
            secrets,
            requiredPermissions,
        });
        
        return secrets;
    }
        
    if (authData.authMode === AUTH_MODE_SERVICE_TOKEN && authData.authPayload instanceof ServiceTokenData) {
        await validateServiceTokenDataClientForSecrets({
            serviceTokenData: authData.authPayload,
            secrets,
            requiredPermissions,
        });
        
        return secrets;
    }

    if (authData.authMode === AUTH_MODE_API_KEY && authData.authPayload instanceof User) {
        await validateUserClientForSecrets({
            user: authData.authPayload,
            secrets,
            requiredPermissions,
        });
        
        return secrets;
    }

    throw UnauthorizedRequestError({
        message: "Failed client authorization for secrets resource",
    });
}