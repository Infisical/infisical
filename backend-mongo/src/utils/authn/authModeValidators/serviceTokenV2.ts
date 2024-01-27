import { Types } from "mongoose";
import { ServiceTokenData } from "../../../models";
import { ResourceNotFoundError, UnauthorizedRequestError } from "../../errors";
import bcrypt from "bcrypt";

interface ValidateServiceTokenV2Params {
    authTokenValue: string;
}

export const validateServiceTokenV2 = async ({
    authTokenValue
}: ValidateServiceTokenV2Params) => {
    const [_, TOKEN_IDENTIFIER, TOKEN_SECRET] = <[string, string, string]>authTokenValue.split(".", 3);

	const serviceTokenData = await ServiceTokenData
		.findById(TOKEN_IDENTIFIER, "+secretHash +expiresAt")

	if (!serviceTokenData) {
		throw UnauthorizedRequestError();
	} else if (serviceTokenData?.expiresAt && new Date(serviceTokenData.expiresAt) < new Date()) {
		// case: service token expired
		await ServiceTokenData.findByIdAndDelete(serviceTokenData._id);
		throw UnauthorizedRequestError({
			message: "Failed to authenticate expired service token",
		});
	}

	const isMatch = await bcrypt.compare(TOKEN_SECRET, serviceTokenData.secretHash);
	if (!isMatch) throw UnauthorizedRequestError();

	const serviceTokenDataToReturn = await ServiceTokenData
		.findOneAndUpdate({
			_id: new Types.ObjectId(TOKEN_IDENTIFIER),
		}, {
			lastUsed: new Date(),
		}, {
			new: true,
		})
		.select("+encryptedKey +iv +tag")

	if (!serviceTokenDataToReturn) throw ResourceNotFoundError();

	return serviceTokenDataToReturn;
}