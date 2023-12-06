import jwt from "jsonwebtoken";
import { 
	IMachineIdentity, 
	IdentityAccessToken, 
} from "../../../models";
import { getAuthSecret } from "../../../config";
import { AuthTokenType } from "../../../variables";
import { UnauthorizedRequestError } from "../../errors";

interface ValidateMachineIdentityParams {
    authTokenValue: string;
}

export const validateMachineIdentity = async ({
    authTokenValue
}: ValidateMachineIdentityParams) => {
    const decodedToken = <jwt.MachineAccessTokenJwtPayload>(
		jwt.verify(authTokenValue, await getAuthSecret())
	);

	if (decodedToken.authTokenType !== AuthTokenType.MACHINE_ACCESS_TOKEN) throw UnauthorizedRequestError();
	
	const machineIdentityAccessToken = await IdentityAccessToken
		.findOne({
			_id: decodedToken.identityAccessTokenId,
			isAccessTokenRevoked: false
		})
		.populate<{ machineIdentity: IMachineIdentity }>("machineIdentity");
	
	if (!machineIdentityAccessToken || !machineIdentityAccessToken?.machineIdentity) throw UnauthorizedRequestError();
	
	const {
		accessTokenNumUsesLimit,
		accessTokenNumUses,
		accessTokenTTL,
		accessTokenLastRenewedAt,
		accessTokenMaxTTL,
		createdAt: accessTokenCreatedAt
	} = machineIdentityAccessToken;
	
	// ttl check
	if (accessTokenTTL > 0) {
		const currentDate = new Date();
		if (accessTokenLastRenewedAt) {
			// access token has been renewed
			const accessTokenRenewed = new Date(accessTokenLastRenewedAt);
			const ttlInMilliseconds = accessTokenTTL * 1000;
			const expirationTime = new Date(accessTokenRenewed.getTime() + ttlInMilliseconds);
			
			if (currentDate > expirationTime) throw UnauthorizedRequestError({
				message: "Failed to authenticate MI access token due to TTL expiration"
			});
		} else {
			// access token has never been renewed
			const accessTokenCreated = new Date(accessTokenCreatedAt);
			const ttlInMilliseconds = accessTokenTTL * 1000;
			const expirationTime = new Date(accessTokenCreated.getTime() + ttlInMilliseconds);
			
			if (currentDate > expirationTime) throw UnauthorizedRequestError({
				message: "Failed to authenticate MI access token due to TTL expiration"
			});
		}
	}
	
	// max ttl check
    if (accessTokenMaxTTL > 0) {
        const accessTokenCreated = new Date(accessTokenCreatedAt);
        const ttlInMilliseconds = accessTokenMaxTTL * 1000;
        const currentDate = new Date();
        const expirationTime = new Date(accessTokenCreated.getTime() + ttlInMilliseconds);

        if (currentDate > expirationTime) throw UnauthorizedRequestError({
			message: "Failed to authenticate MI access token due to Max TTL expiration"
		});
    }

	// num uses check
	if (
		accessTokenNumUsesLimit > 0
		&& accessTokenNumUses === accessTokenNumUsesLimit
	) {
		throw UnauthorizedRequestError({
			message: "Failed to authenticate MI access token due to access token number of uses limit reached"
		});
	}
	
	await IdentityAccessToken.findByIdAndUpdate(
		machineIdentityAccessToken._id,
		{
			accessTokenLastUsedAt: new Date(),
			$inc: { accessTokenNumUses: 1 }
		},
		{
			new: true
		}
	);

    return machineIdentityAccessToken.machineIdentity;
}