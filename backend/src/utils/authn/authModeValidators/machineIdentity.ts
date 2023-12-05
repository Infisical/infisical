import jwt from "jsonwebtoken";
import { Types } from "mongoose";
import { MachineIdentity, MachineIdentityClientSecret } from "../../../models";
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
	
	const machineIdentityClientSecret = await MachineIdentityClientSecret.findOne({
		_id: new Types.ObjectId(decodedToken.clientSecretDataId),
		isActive: true
	});
	
	if (!machineIdentityClientSecret) throw UnauthorizedRequestError();
	
	if (decodedToken.tokenVersion !== machineIdentityClientSecret.accessTokenVersion) {
		// TODO: raise alarm
		throw UnauthorizedRequestError({
			message: "Failed to authenticate",
		});
	}
	
	const machineIdentity = await MachineIdentity.findByIdAndUpdate(
		machineIdentityClientSecret.machineIdentity,
		{
			accessTokenLastUsed: new Date(),
			$inc: { accessTokenUsageCount: 1 }
		},
		{
			new: true
		}
	);
	
	if (!machineIdentity) throw UnauthorizedRequestError({
		message: "Failed to authenticate"
	});

    return machineIdentity;
}