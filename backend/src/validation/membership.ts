import { Types } from "mongoose";
import {
    IServiceAccount,
    IServiceTokenData,
    IUser,
    Membership,
    ServiceAccount,
    ServiceTokenData,
    User,
} from "../models";
import { validateServiceAccountClientForWorkspace } from "./serviceAccount";
import { validateUserClientForWorkspace } from "./user";
import { validateServiceTokenDataClientForWorkspace } from "./serviceTokenData";
import { 
    MembershipNotFoundError,
    UnauthorizedRequestError,
} from "../utils/errors";
import {
    AUTH_MODE_API_KEY,
    AUTH_MODE_JWT,
    AUTH_MODE_SERVICE_ACCOUNT,
    AUTH_MODE_SERVICE_TOKEN,
} from "../variables";

/**
 * Validate authenticated clients for membership with id [membershipId] based
 * on any known permissions.
 * @param {Object} obj
 * @param {Object} obj.authData - authenticated client details
 * @param {Types.ObjectId} obj.membershipId - id of membership to validate against
 * @param {Array<'admin' | 'member'>} obj.acceptedRoles - accepted workspaceRoles
 * @returns {Membership} - validated membership
 */
export const validateClientForMembership = async ({
	authData,
	membershipId,
	acceptedRoles,
}: {
	authData: {
		authMode: string;
		authPayload: IUser | IServiceAccount | IServiceTokenData;
	};
	membershipId: Types.ObjectId;
    acceptedRoles: Array<"admin" | "member">;
}) => {
	
	const membership = await Membership.findById(membershipId);
	
	if (!membership) throw MembershipNotFoundError({
		message: "Failed to find membership",
	});

	if (authData.authMode === AUTH_MODE_JWT && authData.authPayload instanceof User) {
		await validateUserClientForWorkspace({
			user: authData.authPayload,
			workspaceId: membership.workspace,
			acceptedRoles,
		});
		
		return membership;
	}
	
	if (authData.authMode === AUTH_MODE_SERVICE_ACCOUNT && authData.authPayload instanceof ServiceAccount) {
		await validateServiceAccountClientForWorkspace({
			serviceAccount: authData.authPayload,
			workspaceId: membership.workspace,
		});

		return membership;
	}
	
	if (authData.authMode === AUTH_MODE_SERVICE_TOKEN && authData.authPayload instanceof ServiceTokenData) {
		await validateServiceTokenDataClientForWorkspace({
			serviceTokenData: authData.authPayload,
			workspaceId: new Types.ObjectId(membership.workspace),
		});
		
		return membership;
	}

	if (authData.authMode == AUTH_MODE_API_KEY && authData.authPayload instanceof User) {
		await validateUserClientForWorkspace({
			user: authData.authPayload,
			workspaceId: membership.workspace,
			acceptedRoles, 
		});
		
		return membership;
	}
	
	throw UnauthorizedRequestError({
		message: "Failed client authorization for membership",
	});
}