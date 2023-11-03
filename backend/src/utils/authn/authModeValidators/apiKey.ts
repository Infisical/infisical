import { Types } from "mongoose";
import { 
    APIKeyData,
    IUser,
    User
} from "../../../models";
import { AccountNotFoundError, UnauthorizedRequestError } from "../../errors";
import bcrypt from "bcrypt";

interface ValidateAPIKeyParams {
    authTokenValue: string;
}

export const validateAPIKey = async ({
    authTokenValue
}: ValidateAPIKeyParams) => {

    const [_, TOKEN_IDENTIFIER, TOKEN_SECRET] = <[string, string, string]>authTokenValue.split(".", 3);
    
	let apiKeyData = await APIKeyData
		.findById(TOKEN_IDENTIFIER, "+secretHash +expiresAt")
		.populate<{ user: IUser }>("user", "+publicKey");

	if (!apiKeyData) {
		throw UnauthorizedRequestError();
	} else if (apiKeyData?.expiresAt && new Date(apiKeyData.expiresAt) < new Date()) {
		// case: API key expired
		await APIKeyData.findByIdAndDelete(apiKeyData._id);
		throw UnauthorizedRequestError();
	}

	const isMatch = await bcrypt.compare(TOKEN_SECRET, apiKeyData.secretHash);
	if (!isMatch) throw UnauthorizedRequestError();

	apiKeyData = await APIKeyData.findOneAndUpdate({
		_id: new Types.ObjectId(TOKEN_IDENTIFIER),
	}, {
		lastUsed: new Date(),
	}, {
		new: true,
	});

	if (!apiKeyData) throw UnauthorizedRequestError();

	const user = await User.findById(apiKeyData.user).select("+publicKey");

	if (!user) throw AccountNotFoundError();

	return user;
}