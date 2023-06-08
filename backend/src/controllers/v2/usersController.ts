import { Request, Response } from 'express';
import {
    User,
    MembershipOrg
} from '../../models';

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
        .select('+salt +publicKey +encryptedPrivateKey +iv +tag +encryptionVersion +protectedKey +protectedKeyIV +protectedKeyTag');
    
    return res.status(200).send({
        user
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
        req.user.mfaMethods = ['email'];
    } else {
        req.user.mfaMethods = [];
    }

    await req.user.save();
    
    const user = req.user;
    
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
      user: req.user._id
    }).populate('organization')
  ).map((m) => m.organization);

	return res.status(200).send({
		organizations
	});
}
