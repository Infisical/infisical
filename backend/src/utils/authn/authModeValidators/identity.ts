import jwt from "jsonwebtoken";
import { IIdentity, IdentityAccessToken } from "../../../models";
import { getAuthSecret } from "../../../config";
import { AuthTokenType } from "../../../variables";
import { UnauthorizedRequestError } from "../../errors";
import { checkIPAgainstBlocklist } from "../../../utils/ip";

interface ValidateIdentityParams {
    authTokenValue: string;
	ipAddress: string;
}

export const validateIdentity = async ({
    authTokenValue,
	ipAddress
}: ValidateIdentityParams) => {
    const decodedToken = <jwt.IdentityAccessTokenJwtPayload>(
		jwt.verify(authTokenValue, await getAuthSecret())
	);

	if (decodedToken.authTokenType !== AuthTokenType.IDENTITY_ACCESS_TOKEN) throw UnauthorizedRequestError();
	
	const identityAccessToken = await IdentityAccessToken
		.findOne({
			_id: decodedToken.identityAccessTokenId,
			isAccessTokenRevoked: false
		})
		.populate<{ identity: IIdentity }>("identity");
	
	if (!identityAccessToken || !identityAccessToken?.identity) throw UnauthorizedRequestError();
	
	const {
		accessTokenNumUsesLimit,
		accessTokenNumUses,
		accessTokenTTL,
		accessTokenLastRenewedAt,
		accessTokenMaxTTL,
		createdAt: accessTokenCreatedAt
	} = identityAccessToken;

	checkIPAgainstBlocklist({
		ipAddress,
		trustedIps: identityAccessToken.accessTokenTrustedIps
	});
	
	// ttl check
	if (accessTokenTTL > 0) {
		const currentDate = new Date();
		if (accessTokenLastRenewedAt) {
			// access token has been renewed
			const accessTokenRenewed = new Date(accessTokenLastRenewedAt);
			const ttlInMilliseconds = accessTokenTTL * 1000;
			const expirationDate = new Date(accessTokenRenewed.getTime() + ttlInMilliseconds);
			
			if (currentDate > expirationDate) throw UnauthorizedRequestError({
				message: "Failed to authenticate identity access token due to TTL expiration"
			});
		} else {
			// access token has never been renewed
			const accessTokenCreated = new Date(accessTokenCreatedAt);
			const ttlInMilliseconds = accessTokenTTL * 1000;
			const expirationDate = new Date(accessTokenCreated.getTime() + ttlInMilliseconds);
			
			if (currentDate > expirationDate) throw UnauthorizedRequestError({
				message: "Failed to authenticate identity access token due to TTL expiration"
			});
		}
	}
	
	// max ttl check
    if (accessTokenMaxTTL > 0) {
        const accessTokenCreated = new Date(accessTokenCreatedAt);
        const ttlInMilliseconds = accessTokenMaxTTL * 1000;
        const currentDate = new Date();
        const expirationDate = new Date(accessTokenCreated.getTime() + ttlInMilliseconds);

        if (currentDate > expirationDate) throw UnauthorizedRequestError({
			message: "Failed to authenticate identity access token due to Max TTL expiration"
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
		identityAccessToken._id,
		{
			accessTokenLastUsedAt: new Date(),
			$inc: { accessTokenNumUses: 1 }
		},
		{
			new: true
		}
	);

    return identityAccessToken.identity;
}