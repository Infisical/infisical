/* eslint-disable @typescript-eslint/no-var-requires */
import { Request, Response } from "express";
import jwt from "jsonwebtoken";
import * as Sentry from "@sentry/node";
import * as bigintConversion from "bigint-conversion";
const jsrp = require("jsrp");
import { LoginSRPDetail, User } from "../../models";
import { createToken, issueAuthTokens, validateProviderAuthToken } from "../../helpers/auth";
import { checkUserDevice } from "../../helpers/user";
import { sendMail } from "../../helpers/nodemailer";
import { TokenService } from "../../services";
import { EELogService } from "../../ee/services";
import { BadRequestError, InternalServerError } from "../../utils/errors";
import {
    ACTION_LOGIN,
    TOKEN_EMAIL_MFA,
} from "../../variables";
import { getChannelFromUserAgent } from "../../utils/posthog"; // TODO: move this
import {
    getHttpsEnabled,
    getJwtMfaLifetime,
    getJwtMfaSecret,
} from "../../config";
import { AuthProvider } from "../../models/user";

declare module "jsonwebtoken" {
    export interface ProviderAuthJwtPayload extends jwt.JwtPayload {
        userId: string;
        email: string;
        authProvider: AuthProvider;
        isUserCompleted: boolean,
    }
}

/**
 * Log in user step 1: Return [salt] and [serverPublicKey] as part of step 1 of SRP protocol
 * @param req
 * @param res
 * @returns
 */
export const login1 = async (req: Request, res: Response) => {
    try {
        const {
            email,
            providerAuthToken,
            clientPublicKey,
        }: {
            email: string;
            clientPublicKey: string,
            providerAuthToken?: string;
        } = req.body;

        const user = await User.findOne({
            email,
        }).select("+salt +verifier");

        if (!user) throw new Error("Failed to find user");

        if (user.authProvider && user.authProvider !== AuthProvider.EMAIL) {
            await validateProviderAuthToken({
                email,
                user,
                providerAuthToken,
            })
        }

        const server = new jsrp.server();
        server.init(
            {
                salt: user.salt,
                verifier: user.verifier,
            },
            async () => {
                // generate server-side public key
                const serverPublicKey = server.getPublicKey();
                await LoginSRPDetail.findOneAndReplace({
                    email: email,
                }, {
                    email,
                    userId: user.id,
                    clientPublicKey: clientPublicKey,
                    serverBInt: bigintConversion.bigintToBuf(server.bInt),
                }, { upsert: true, returnNewDocument: false });

                return res.status(200).send({
                    serverPublicKey,
                    salt: user.salt,
                });
            }
        );
    } catch (err) {
        Sentry.setUser(null);
        Sentry.captureException(err);
        return res.status(400).send({
            message: "Failed to start authentication process",
        });
    }
};

/**
 * Log in user step 2: complete step 2 of SRP protocol and return token and their (encrypted)
 * private key
 * @param req
 * @param res
 * @returns
 */
export const login2 = async (req: Request, res: Response) => {
    try {
        if (!req.headers["user-agent"]) throw InternalServerError({ message: "User-Agent header is required" });

        const { email, clientProof, providerAuthToken } = req.body;

        const user = await User.findOne({
            email,
        }).select("+salt +verifier +encryptionVersion +protectedKey +protectedKeyIV +protectedKeyTag +publicKey +encryptedPrivateKey +iv +tag +devices");

        if (!user) throw new Error("Failed to find user");

        if (user.authProvider && user.authProvider !== AuthProvider.EMAIL) {
            await validateProviderAuthToken({
                email,
                user,
                providerAuthToken,
            })
        }

        const loginSRPDetail = await LoginSRPDetail.findOneAndDelete({ email: email })

        if (!loginSRPDetail) {
            return BadRequestError(Error("Failed to find login details for SRP"))
        }

        const server = new jsrp.server();
        server.init(
            {
                salt: user.salt,
                verifier: user.verifier,
                b: loginSRPDetail.serverBInt,
            },
            async () => {
                server.setClientPublicKey(loginSRPDetail.clientPublicKey);

                // compare server and client shared keys
                if (server.checkClientProof(clientProof)) {

                    if (user.isMfaEnabled) {
                        // case: user has MFA enabled

                        // generate temporary MFA token
                        const token = createToken({
                            payload: {
                                userId: user._id.toString(),
                            },
                            expiresIn: await getJwtMfaLifetime(),
                            secret: await getJwtMfaSecret(),
                        });

                        const code = await TokenService.createToken({
                            type: TOKEN_EMAIL_MFA,
                            email,
                        });

                        // send MFA code [code] to [email]
                        await sendMail({
                            template: "emailMfa.handlebars",
                            subjectLine: "Infisical MFA code",
                            recipients: [user.email],
                            substitutions: {
                                code,
                            },
                        });

                        return res.status(200).send({
                            mfaEnabled: true,
                            token,
                        });
                    }

                    await checkUserDevice({
                        user,
                        ip: req.realIP,
                        userAgent: req.headers["user-agent"] ?? "",
                    });

                    // issue tokens
                    const tokens = await issueAuthTokens({ 
                        userId: user._id,
                        ip: req.realIP,
                        userAgent: req.headers["user-agent"] ?? "",
                    });
                    
                    // store (refresh) token in httpOnly cookie
                    res.cookie("jid", tokens.refreshToken, {
                        httpOnly: true,
                        path: "/",
                        sameSite: "strict",
                        secure: await getHttpsEnabled(),
                    });

                    // case: user does not have MFA enablgged
                    // return (access) token in response

                    interface ResponseData {
                        mfaEnabled: boolean;
                        encryptionVersion: any;
                        protectedKey?: string;
                        protectedKeyIV?: string;
                        protectedKeyTag?: string;
                        token: string;
                        publicKey?: string;
                        encryptedPrivateKey?: string;
                        iv?: string;
                        tag?: string;
                    }

                    const response: ResponseData = {
                        mfaEnabled: false,
                        encryptionVersion: user.encryptionVersion,
                        token: tokens.token,
                        publicKey: user.publicKey,
                        encryptedPrivateKey: user.encryptedPrivateKey,
                        iv: user.iv,
                        tag: user.tag,
                    }

                    if (
                        user?.protectedKey &&
                        user?.protectedKeyIV &&
                        user?.protectedKeyTag
                    ) {
                        response.protectedKey = user.protectedKey;
                        response.protectedKeyIV = user.protectedKeyIV
                        response.protectedKeyTag = user.protectedKeyTag;
                    }

                    const loginAction = await EELogService.createAction({
                        name: ACTION_LOGIN,
                        userId: user._id,
                    });

                    loginAction && await EELogService.createLog({
                        userId: user._id,
                        actions: [loginAction],
                        channel: getChannelFromUserAgent(req.headers["user-agent"]),
                        ipAddress: req.realIP,
                    });

                    return res.status(200).send(response);
                }

                return res.status(400).send({
                    message: "Failed to authenticate. Try again?",
                });
            }
        );
    } catch (err) {
        Sentry.setUser(null);
        Sentry.captureException(err);
        return res.status(400).send({
            message: "Failed to authenticate. Try again?",
        });
    }
};
