import { Types } from "mongoose";
import {
    IUser,
    IWorkspace,
    IntegrationAuth,
} from "../models";
import {
    IntegrationAuthNotFoundError,
    UnauthorizedRequestError,
} from "../utils/errors";
import { IntegrationService } from "../services";
import { validateUserClientForWorkspace } from "./user";
import { AuthData } from "../interfaces/middleware";
import { ActorType } from "../ee/models";

/**
 * Validate authenticated clients for integration authorization with id [integrationAuthId] based
 * on any known permissions.
 * @param {Object} obj
 * @param {Object} obj.authData - authenticated client details
 * @param {Types.ObjectId} obj.integrationAuthId - id of integration authorization to validate against
 * @param {Array<'admin' | 'member'>} obj.acceptedRoles - accepted workspace roles
 * @param {String[]} obj.requiredPermissions - required permissions as part of the endpoint
 */
 const validateClientForIntegrationAuth = async ({
    authData,
    integrationAuthId,
    acceptedRoles,
    attachAccessToken,
}: {
    authData: AuthData;
    integrationAuthId: Types.ObjectId;
    acceptedRoles: Array<"admin" | "member">;
    attachAccessToken?: boolean;
}) => {

    const integrationAuth = await IntegrationAuth
        .findById(integrationAuthId)
        .populate<{ workspace: IWorkspace }>("workspace")
        .select(
			"+refreshCiphertext +refreshIV +refreshTag +accessCiphertext +accessIV +accessTag +accessExpiresAt"
        );
    
    if (!integrationAuth) throw IntegrationAuthNotFoundError();
    
    let accessToken, accessId;
    if (attachAccessToken) {
        const access = (await IntegrationService.getIntegrationAuthAccess({
            integrationAuthId: integrationAuth._id,
        }));
        
        accessToken = access.accessToken;
        accessId = access.accessId;
    }
    
    switch (authData.actor.type) {
        case ActorType.USER:
            await validateUserClientForWorkspace({
                user: authData.authPayload as IUser,
                workspaceId: integrationAuth.workspace._id,
                acceptedRoles,
            });

            return ({ integrationAuth, accessToken, accessId }); 
        case ActorType.SERVICE:
            throw UnauthorizedRequestError({
                message: "Failed service token authorization for integration authorization",
            });
    }
}

export {
    validateClientForIntegrationAuth,
};