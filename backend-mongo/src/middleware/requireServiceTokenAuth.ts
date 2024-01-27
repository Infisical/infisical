import jwt from "jsonwebtoken";
import { NextFunction, Request, Response } from "express";
import { ServiceToken } from "../models";
import { BadRequestError, UnauthorizedRequestError } from "../utils/errors";
import { getJwtServiceSecret } from "../config";

// TODO: deprecate
declare module "jsonwebtoken" {
	export interface UserIDJwtPayload extends jwt.JwtPayload {
		userId: string;
	}
}

/**
 * Validate if JWT (service) token on request is valid (e.g. not expired),
 * and if there is an associated service token
 * @param req - express request object
 * @param res - express response object
 * @param next - express next function
 * @returns
 */
const requireServiceTokenAuth = async (
	req: Request,
	res: Response,
	next: NextFunction
) => {
	// JWT service token middleware
	
	const [ AUTH_TOKEN_TYPE, AUTH_TOKEN_VALUE ] = <[string, string]>req.headers["authorization"]?.split(" ", 2) ?? [null, null]
	if(AUTH_TOKEN_TYPE === null) return next(BadRequestError({message: "Missing Authorization Header in the request header."}))
	//TODO: Determine what is the actual Token Type for Service Token Authentication (ex. Bearer)
	//if(AUTH_TOKEN_TYPE.toLowerCase() !== 'bearer') return next(UnauthorizedRequestError({message: `The provided authentication type '${AUTH_TOKEN_TYPE}' is not supported.`}))
	if(AUTH_TOKEN_VALUE === null) return next(BadRequestError({message: "Missing Authorization Body in the request header"}))

	const decodedToken = <jwt.UserIDJwtPayload>(
		jwt.verify(AUTH_TOKEN_VALUE, await getJwtServiceSecret())
	);

	const serviceToken = await ServiceToken.findOne({
		_id: decodedToken.serviceTokenId,
	})
		.populate("user", "+publicKey")
		.select("+encryptedKey +publicKey +nonce");

	if (!serviceToken) return next(UnauthorizedRequestError({message: "The service token does not match the record in the database"}))

	req.serviceToken = serviceToken;
	return next();
};

export default requireServiceTokenAuth;
