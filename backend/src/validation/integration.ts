import { Types } from "mongoose";
import {
    IUser,
    Integration,
    IntegrationAuth,
} from "../models";
import { validateUserClientForWorkspace } from "./user";
import { IntegrationService } from "../services";
import {
    IntegrationAuthNotFoundError,
    IntegrationNotFoundError,
    UnauthorizedRequestError,
} from "../utils/errors";
import { AuthData } from "../interfaces/middleware";
import { ActorType } from "../ee/models";

/**
 * Validate authenticated clients for integration with id [integrationId] based
 * on any known permissions.
 * @param {Object} obj
 * @param {Object} obj.authData - authenticated client details
 * @param {Types.ObjectId} obj.integrationId - id of integration to validate against
 * @param {String} obj.environment - (optional) environment in workspace to validate against
 * @param {Array<'admin' | 'member'>} obj.acceptedRoles - accepted workspace roles
 * @param {String[]} obj.requiredPermissions - required permissions as part of the endpoint
 */
export const validateClientForIntegration = async ({
    authData,
    integrationId,
    acceptedRoles,
}: {
    authData: AuthData;
    integrationId: Types.ObjectId;
    acceptedRoles: Array<"admin" | "member">;
}) => {
    
    const integration = await Integration.findById(integrationId);
    if (!integration) throw IntegrationNotFoundError();

    const integrationAuth = await IntegrationAuth
        .findById(integration.integrationAuth)
        .select(
			"+refreshCiphertext +refreshIV +refreshTag +accessCiphertext +accessIV +accessTag +accessExpiresAt"
        );
    
    if (!integrationAuth) throw IntegrationAuthNotFoundError();

    const accessToken = (await IntegrationService.getIntegrationAuthAccess({
        integrationAuthId: integrationAuth._id,
    })).accessToken;
    
    switch (authData.actor.type) {
        case ActorType.USER:
            await validateUserClientForWorkspace({
                user: authData.authPayload as IUser,
                workspaceId: integration.workspace,
                acceptedRoles,
            });
        
            return ({ integration, accessToken }); 
        case ActorType.SERVICE:
            throw UnauthorizedRequestError({
                message: "Failed service token authorization for integration",
            }); 
    }
}