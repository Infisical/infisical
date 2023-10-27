import jwt from "jsonwebtoken";
import { APIKeyDataV2, User } from "../../../models";
import { getAuthSecret } from "../../../config";
import { AuthTokenType } from "../../../variables";
import { AccountNotFoundError, UnauthorizedRequestError } from "../../errors";

interface ValidateAPIKeyV2Params {
    authTokenValue: string;
}

export const validateAPIKeyV2 = async ({
    authTokenValue
}: ValidateAPIKeyV2Params) => {
    
    const decodedToken = <jwt.UserIDJwtPayload>(
        jwt.verify(authTokenValue, await getAuthSecret())
    );
    
    if (decodedToken.authTokenType !== AuthTokenType.API_KEY) throw UnauthorizedRequestError();
    
    const apiKeyData = await APIKeyDataV2.findByIdAndUpdate(
        decodedToken.apiKeyDataId,
        {
            lastUsed: new Date(),
            $inc: { usageCount: 1 }
        },
        {
            new: true
        }
    );
    
    if (!apiKeyData) throw UnauthorizedRequestError();
    
    const user = await User.findById(apiKeyData.user).select("+publicKey");
    
	if (!user) throw AccountNotFoundError();
    
    return user;
}
