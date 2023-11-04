import { AuthData } from "../../../interfaces/middleware";
import jwt from "jsonwebtoken";
import { getAuthSecret } from "../../../config";
import { ActorType } from "../../../ee/models";
import { AuthMode, AuthTokenType } from "../../../variables";
import { UnauthorizedRequestError } from "../../errors";
import {
  validateAPIKey,
  validateAPIKeyV2,
  validateJWT,
  validateServiceTokenV2,
  validateServiceTokenV3
} from "../authModeValidators";
import { getUserAgentType } from "../../posthog";

export * from "./authDataExtractors";

interface ExtractAuthModeParams {
    headers: { [key: string]: string | string[] | undefined }
}

interface ExtractAuthModeReturn {
    authMode: AuthMode;
    authTokenValue: string;
}

interface GetAuthDataParams {
    authMode: AuthMode;
    authTokenValue: string;
    ipAddress: string;
    userAgent: string;
}

/**
 * Returns the recognized authentication mode based on token in [headers]; accepted token types include:
 * - SERVICE_TOKEN
 * - API_KEY
 * - JWT
 * - SERVICE_ACCESS_TOKEN (from ST V3)
 * - API_KEY_V2
 * @param {Object} params
 * @param {Object.<string, (string|string[]|undefined)>} params.headers - The HTTP request headers, usually from Express's `req.headers`.
 * @returns {Promise<AuthMode>} The derived authentication mode based on the headers.
 * @throws {UnauthorizedError} Throws an error if no applicable authMode is found.
 */
export const extractAuthMode = async ({
    headers
}: ExtractAuthModeParams): Promise<ExtractAuthModeReturn> => {

    const apiKey = headers["x-api-key"] as string;
	const authHeader = headers["authorization"] as string;
    
    if (apiKey) {
        return { authMode: AuthMode.API_KEY, authTokenValue: apiKey };
    }
    
    if (!authHeader) throw UnauthorizedRequestError({
        message: "Failed to authenticate unknown authentication method"
    });

    if (!authHeader.startsWith("Bearer ")) throw UnauthorizedRequestError({
        message: "Failed to authenticate unknown authentication method"
    });

    const authTokenValue = authHeader.slice(7);
    
    if (authTokenValue.startsWith("st.")) {
        return { authMode: AuthMode.SERVICE_TOKEN, authTokenValue };
    }

    const decodedToken = <jwt.AuthnJwtPayload>(
        jwt.verify(authTokenValue, await getAuthSecret())
    );

    switch (decodedToken.authTokenType) {
        case AuthTokenType.ACCESS_TOKEN:
            return { authMode: AuthMode.JWT, authTokenValue };
        case AuthTokenType.API_KEY:
            return { authMode: AuthMode.API_KEY_V2, authTokenValue };
        case AuthTokenType.SERVICE_ACCESS_TOKEN:
            return { authMode: AuthMode.SERVICE_ACCESS_TOKEN, authTokenValue };
        default:
            throw UnauthorizedRequestError({
                message: "Failed to authenticate unknown authentication method"
            });
    }
}

export const getAuthData = async ({
    authMode,
    authTokenValue,
    ipAddress,
    userAgent
}: GetAuthDataParams): Promise<AuthData> => {

    const userAgentType = getUserAgentType(userAgent);

    switch (authMode) {
        case AuthMode.SERVICE_TOKEN: {
            const serviceTokenData = await validateServiceTokenV2({
                authTokenValue
            });

            return {
                actor: {
                    type: ActorType.SERVICE,
                    metadata: {
                        serviceId: serviceTokenData._id.toString(),
                        name: serviceTokenData.name
                    }
                },
                authPayload: serviceTokenData,
                ipAddress,
                userAgent,
                userAgentType
            }
        }
        case AuthMode.SERVICE_ACCESS_TOKEN: {
            const serviceTokenData = await validateServiceTokenV3({
                authTokenValue
            });

            return {
                actor: {
                    type: ActorType.SERVICE_V3,
                    metadata: {
                        serviceId: serviceTokenData._id.toString(),
                        name: serviceTokenData.name
                    }
                },
                authPayload: serviceTokenData,
                ipAddress,
                userAgent,
                userAgentType
            }
        }
        case AuthMode.API_KEY: {
            const user = await validateAPIKey({
                authTokenValue
            });
            
            return {
                actor: {
                    type: ActorType.USER,
                    metadata: {
                        userId: user._id.toString(),
                        email: user.email
                    }
                },
                authPayload: user,
                ipAddress,
                userAgent,
                userAgentType
            }
        }
        case AuthMode.API_KEY_V2: {
            const user = await validateAPIKeyV2({
                authTokenValue
            });

            return {
                actor: {
                    type: ActorType.USER,
                    metadata: {
                        userId: user._id.toString(),
                        email: user.email
                    }
                },
                authPayload: user,
                ipAddress,
                userAgent,
                userAgentType
            }
        }
        case AuthMode.JWT: {
            const user = await validateJWT({
                authTokenValue
            });
            
            return {
                actor: {
                    type: ActorType.USER,
                    metadata: {
                        userId: user._id.toString(),
                        email: user.email
                    }
                },
                authPayload: user,
                ipAddress,
                userAgent,
                userAgentType
            }
        }
    }
}