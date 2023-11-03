import jwt from "jsonwebtoken";
import { Types } from "mongoose";
import { TokenVersion, User } from "../../../models";
import { getAuthSecret } from "../../../config";
import { AuthTokenType } from "../../../variables";
import { AccountNotFoundError, UnauthorizedRequestError } from "../../errors";

interface ValidateJWTParams {
    authTokenValue: string;
}

export const validateJWT = async ({
    authTokenValue
}: ValidateJWTParams) => {
    
    const decodedToken = <jwt.UserIDJwtPayload>(
        jwt.verify(authTokenValue, await getAuthSecret())
    );

    if (decodedToken.authTokenType !== AuthTokenType.ACCESS_TOKEN) throw UnauthorizedRequestError();

    const tokenVersion = await TokenVersion.findOneAndUpdate({
        _id: new Types.ObjectId(decodedToken.tokenVersionId),
        user: decodedToken.userId
    }, {
        lastUsed: new Date(),
    });
    
	if (!tokenVersion) throw UnauthorizedRequestError();
    if (decodedToken.accessVersion !== tokenVersion.accessVersion) throw UnauthorizedRequestError();

    const user = await User.findOne({
		_id: new Types.ObjectId(decodedToken.userId),
	}).select("+publicKey");

	if (!user) throw AccountNotFoundError({ message: "Failed to find user" });

	if (!user?.publicKey) throw UnauthorizedRequestError({ message: "Failed to authenticate user with partially set up account" });

    return user;
}
