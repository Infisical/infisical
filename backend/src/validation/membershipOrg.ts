import { Types } from "mongoose";
import {
    IServiceAccount,
    IServiceTokenData,
    IUser,
    MembershipOrg,
    ServiceAccount,
    ServiceTokenData,
    User,
} from "../models";
import {
    validateMembershipOrg,
} from "../helpers/membershipOrg";
import {
    MembershipOrgNotFoundError,
    UnauthorizedRequestError,
} from "../utils/errors";
import {
    AUTH_MODE_API_KEY,
    AUTH_MODE_JWT,
    AUTH_MODE_SERVICE_ACCOUNT,
    AUTH_MODE_SERVICE_TOKEN,
} from "../variables";

/**
 * Validate authenticated clients for organization membership with id [membershipOrgId] based
 * on any known permissions.
 * @param {Object} obj
 * @param {Object} obj.authData - authenticated client details
 * @param {Types.ObjectId} obj.membershipOrgId - id of organization membership to validate against
 * @param {Array<'owner' | 'admin' | 'member'>} obj.acceptedRoles - accepted organization roles
 * @param {MembershipOrg} - validated organization membership
 */
export const validateClientForMembershipOrg = async ({
	authData,
	membershipOrgId,
	acceptedRoles,
	acceptedStatuses,
}: {
	authData: {
		authMode: string;
		authPayload: IUser | IServiceAccount | IServiceTokenData;
	};
	membershipOrgId: Types.ObjectId;
    acceptedRoles: Array<"owner" | "admin" | "member">;
    acceptedStatuses: Array<"invited" | "accepted">;
}) => {
	const membershipOrg = await MembershipOrg.findById(membershipOrgId);

	if (!membershipOrg) throw MembershipOrgNotFoundError({
		message: "Failed to find organization membership ",
	});

	if (authData.authMode === AUTH_MODE_JWT && authData.authPayload instanceof User) {
		await validateMembershipOrg({
			userId: authData.authPayload._id,
			organizationId: membershipOrg.organization,
			acceptedRoles,
			acceptedStatuses,
		});
		
		return membershipOrg;
	}

	if (authData.authMode === AUTH_MODE_SERVICE_ACCOUNT && authData.authPayload instanceof ServiceAccount) {
		if (!authData.authPayload.organization.equals(membershipOrg.organization)) throw UnauthorizedRequestError({
			message: "Failed service account client authorization for organization membership",
		});
		
		return membershipOrg;
	}

	if (authData.authMode === AUTH_MODE_SERVICE_TOKEN && authData.authPayload instanceof ServiceTokenData) {
		throw UnauthorizedRequestError({
			message: "Failed service account client authorization for organization membership",
		});
	}
	
	if (authData.authMode === AUTH_MODE_API_KEY && authData.authPayload instanceof User) {
		await validateMembershipOrg({
			userId: authData.authPayload._id,
			organizationId: membershipOrg.organization,
			acceptedRoles,
			acceptedStatuses,
		});
		
		return membershipOrg;
	}
	
	throw UnauthorizedRequestError({
		message: "Failed client authorization for organization membership",
	});
}