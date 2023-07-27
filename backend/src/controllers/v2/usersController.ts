import { Request, Response } from "express";
import { Types } from "mongoose";
import crypto from "crypto";
import bcrypt from "bcrypt";
import {
    APIKeyData,
    AuthProvider,
    MembershipOrg,
    TokenVersion,
    User
} from "../../models";
import { getSaltRounds } from "../../config";

/**
 * Return the current user.
 * @param req 
 * @param res 
 * @returns 
 */
export const getMe = async (req: Request, res: Response) => {
    /* 
    #swagger.summary = "Retrieve the current user on the request"
    #swagger.description = "Retrieve the current user on the request"
    
    #swagger.security = [{
        "apiKeyAuth": []
    }]

    #swagger.responses[200] = {
        content: {
            "application/json": {
                "schema": { 
                    "type": "object",
                    "properties": {
                        "user": {
                            "type": "object",
                            $ref: "#/components/schemas/CurrentUser",
                            "description": "Current user on request"
                        }
                    }
                }
            }           
        }
    }   
    */
    const user = await User
        .findById(req.user._id)
        .select("+salt +publicKey +encryptedPrivateKey +iv +tag +encryptionVersion +protectedKey +protectedKeyIV +protectedKeyTag");
    
    return res.status(200).send({
        user,
    });
}

/**
 * Update the current user's MFA-enabled status [isMfaEnabled].
 * Note: Infisical currently only supports email-based 2FA only; this will expand to
 * include SMS and authenticator app modes of authentication in the future.
 * @param req 
 * @param res 
 * @returns 
 */
export const updateMyMfaEnabled = async (req: Request, res: Response) => {
    const { isMfaEnabled }: { isMfaEnabled: boolean } = req.body;
    req.user.isMfaEnabled = isMfaEnabled;
    
    if (isMfaEnabled) { 
        // TODO: adapt this route/controller 
        // to work for different forms of MFA
        req.user.mfaMethods = ["email"];
    } else {
        req.user.mfaMethods = [];
    }

    await req.user.save();
    
    const user = req.user;
    
    return res.status(200).send({
        user,
    });
}

/**
 * Update name of the current user to [firstName, lastName].
 * @param req 
 * @param res 
 * @returns 
 */
export const updateName = async (req: Request, res: Response) => {
    const { 
        firstName, 
        lastName 
    }: { 
        firstName: string; 
        lastName: string; 
    } = req.body;
    
    const user = await User.findByIdAndUpdate(
        req.user._id.toString(),
        {
            firstName,
            lastName: lastName ?? ""
        },
        {
            new: true
        }
    );
    
    return res.status(200).send({
        user,
    });
}

/**
 * Update auth provider of the current user to [authProvider]
 * @param req 
 * @param res 
 * @returns 
 */
export const updateAuthProvider = async (req: Request, res: Response) => {
    const {
        authProvider
    } = req.body;
    
    if (req.user?.authProvider === AuthProvider.OKTA_SAML) return res.status(400).send({
        message: "Failed to update user authentication method because SAML SSO is enforced"
    });

    const user = await User.findByIdAndUpdate(
        req.user._id.toString(),
        {
            authProvider
        },
        {
            new: true
        }
    );

    return res.status(200).send({
        user
    });
}

/**
 * Return organizations that the current user is part of.
 * @param req 
 * @param res 
 */
export const getMyOrganizations = async (req: Request, res: Response) => {
    /* 
    #swagger.summary = 'Return organizations that current user is part of'
    #swagger.description = 'Return organizations that current user is part of'
    
    #swagger.security = [{
        "apiKeyAuth": []
    }]

    #swagger.responses[200] = {
        content: {
            "application/json": {
                "schema": { 
                    "type": "object",
					"properties": {
						"organizations": {
							"type": "array",
							"items": {
								$ref: "#/components/schemas/Organization" 
							},
							"description": "Organizations that user is part of"
						}
					}
                }
            }           
        }
    }   
    */
  const organizations = (
    await MembershipOrg.find({
      user: req.user._id,
    }).populate("organization")
  ).map((m) => m.organization);

	return res.status(200).send({
		organizations,
	});
}

/**
 * Return API keys belonging to current user.
 * @param req 
 * @param res 
 * @returns 
 */
export const getMyAPIKeys = async (req: Request, res: Response) => {
    const apiKeyData = await APIKeyData.find({
		user: req.user._id,
	});

	return res.status(200).send(apiKeyData);
}

/**
 * Create new API key for current user.
 * @param req 
 * @param res 
 * @returns 
 */
export const createAPIKey = async (req: Request, res: Response) => {
	const { name, expiresIn } = req.body;

	const secret = crypto.randomBytes(16).toString("hex");
	const secretHash = await bcrypt.hash(secret, await getSaltRounds());

	const expiresAt = new Date();
	expiresAt.setSeconds(expiresAt.getSeconds() + expiresIn);

	let apiKeyData = await new APIKeyData({
		name,
		lastUsed: new Date(),
		expiresAt,
		user: req.user._id,
		secretHash,
	}).save();

	// return api key data without sensitive data
	apiKeyData = (await APIKeyData.findById(apiKeyData._id)) as any;

	if (!apiKeyData) throw new Error("Failed to find API key data");

	const apiKey = `ak.${apiKeyData._id.toString()}.${secret}`;

	return res.status(200).send({
		apiKey,
		apiKeyData,
	});
}

/**
 * Delete API key with id [apiKeyDataId] belonging to current user
 * @param req 
 * @param res 
 */
export const deleteAPIKey = async (req: Request, res: Response) => {
    const { apiKeyDataId } = req.params;

    const apiKeyData = await APIKeyData.findOneAndDelete({
        _id: new Types.ObjectId(apiKeyDataId),
        user: req.user._id
    });

	return res.status(200).send({
		apiKeyData
	});
}

/**
 * Return active sessions (TokenVersion) belonging to user
 * @param req 
 * @param res 
 * @returns 
 */
export const getMySessions = async (req: Request, res: Response) => {
    const tokenVersions = await TokenVersion.find({
        user: req.user._id
    });
    
    return res.status(200).send(tokenVersions);
}

/**
 * Revoke all active sessions belong to user
 * @param req 
 * @param res 
 * @returns 
 */
export const deleteMySessions = async (req: Request, res: Response) => {
    await TokenVersion.updateMany({
        user: req.user._id,
    }, {
        $inc: {
            refreshVersion: 1,
            accessVersion: 1,
        },
    });

    return res.status(200).send({
        message: "Successfully revoked all sessions"
    });
}