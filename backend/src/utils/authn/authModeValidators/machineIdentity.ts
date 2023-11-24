import jwt from "jsonwebtoken";
import { Types } from "mongoose";
import { MachineIdentity } from "../../../models";
import { getAuthSecret } from "../../../config";
import { AuthTokenType } from "../../../variables";
import { UnauthorizedRequestError } from "../../errors";

interface ValidateMachineIdentityParams {
    authTokenValue: string;
}

export const validateMachineIdentity = async ({
    authTokenValue
}: ValidateMachineIdentityParams) => {
    const decodedToken = <jwt.ServiceRefreshTokenJwtPayload>(
		jwt.verify(authTokenValue, await getAuthSecret())
	);

	if (decodedToken.authTokenType !== AuthTokenType.SERVICE_ACCESS_TOKEN) throw UnauthorizedRequestError();
	
	const machineIdentity = await MachineIdentity.findOne({
		_id: new Types.ObjectId(decodedToken.serviceTokenDataId),
		isActive: true
	});
	
	if (!machineIdentity) {
		throw UnauthorizedRequestError({ 
			message: "Failed to authenticate"
		});
	} else if (machineIdentity?.expiresAt && new Date(machineIdentity.expiresAt) < new Date()) {
		// case: service token expired
		await MachineIdentity.findByIdAndUpdate(
			machineIdentity._id,
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
	} else if (decodedToken.tokenVersion !== machineIdentity.tokenVersion) {
		// TODO: raise alarm
		throw UnauthorizedRequestError({
			message: "Failed to authenticate",
		});
	}
	
	await MachineIdentity.findByIdAndUpdate(
		machineIdentity._id,
		{
			accessTokenLastUsed: new Date(),
			$inc: { accessTokenUsageCount: 1 }
		},
		{
			new: true
		}
	);

    return machineIdentity;
}