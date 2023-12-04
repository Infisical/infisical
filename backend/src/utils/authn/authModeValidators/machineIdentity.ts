import jwt from "jsonwebtoken";
import { Types } from "mongoose";
import { MachineIdentity, MachineIdentityClientSecretData } from "../../../models";
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
	
	const machineIdentityClientSecretData = await MachineIdentityClientSecretData.findOne({
		_id: new Types.ObjectId(decodedToken.clientSecretDataId),
		isActive: true
	});
	
	if (!machineIdentityClientSecretData) throw UnauthorizedRequestError();
	
	if (decodedToken.tokenVersion !== machineIdentityClientSecretData.accessTokenVersion) {
		// TODO: raise alarm
		throw UnauthorizedRequestError({
			message: "Failed to authenticate",
		});
	}
	
	const machineIdentity = await MachineIdentity.findByIdAndUpdate(
		machineIdentityClientSecretData.machineIdentity,
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