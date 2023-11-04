import jwt from "jsonwebtoken";
import { Types } from "mongoose";
import { ServiceTokenDataV3 } from "../../../models";
import { getAuthSecret } from "../../../config";
import { AuthTokenType } from "../../../variables";
import { UnauthorizedRequestError } from "../../errors";

interface ValidateServiceTokenV3Params {
    authTokenValue: string;
}

export const validateServiceTokenV3 = async ({
    authTokenValue
}: ValidateServiceTokenV3Params) => {
    const decodedToken = <jwt.ServiceRefreshTokenJwtPayload>(
		jwt.verify(authTokenValue, await getAuthSecret())
	);

	if (decodedToken.authTokenType !== AuthTokenType.SERVICE_ACCESS_TOKEN) throw UnauthorizedRequestError();
	
	const serviceTokenData = await ServiceTokenDataV3.findOne({
		_id: new Types.ObjectId(decodedToken.serviceTokenDataId),
		isActive: true
	});
	
	if (!serviceTokenData) {
		throw UnauthorizedRequestError({ 
			message: "Failed to authenticate"
		});
	} else if (serviceTokenData?.expiresAt && new Date(serviceTokenData.expiresAt) < new Date()) {
		// case: service token expired
		await ServiceTokenDataV3.findByIdAndUpdate(
			serviceTokenData._id,
			{
				isActive: false
			},
			{
				new: true
			}
		);
		
		throw UnauthorizedRequestError({
			message: "Failed to authenticate",
		});
	} else if (decodedToken.tokenVersion !== serviceTokenData.tokenVersion) {
		// TODO: raise alarm
		throw UnauthorizedRequestError({
			message: "Failed to authenticate",
		});
	}
	
	await ServiceTokenDataV3.findByIdAndUpdate(
		serviceTokenData._id,
		{
			accessTokenLastUsed: new Date(),
			$inc: { accessTokenUsageCount: 1 }
		},
		{
			new: true
		}
	);

    return serviceTokenData;
}