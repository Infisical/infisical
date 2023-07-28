import { Request, Response } from "express";
import { Types } from "mongoose";
import { BotOrgService } from "../../../services";
import { SSOConfig } from "../../models";
import { 
    MembershipOrg,
    User
} from "../../../models";
import { getSSOConfigHelper } from "../../helpers/organizations";
import { client } from "../../../config";
import { ResourceNotFoundError } from "../../../utils/errors";
import { getSiteURL } from "../../../config";
import { EELicenseService } from "../../services";

/**
 * Redirect user to appropriate SSO endpoint after successful authentication
 * to finish inputting their master key for logging in or signing up
 * @param req 
 * @param res 
 * @returns 
 */
export const redirectSSO = async (req: Request, res: Response) => {
    if (req.isUserCompleted) {
      return res.redirect(`${await getSiteURL()}/login/sso?token=${encodeURIComponent(req.providerAuthToken)}`);
    }
    
    return res.redirect(`${await getSiteURL()}/signup/sso?token=${encodeURIComponent(req.providerAuthToken)}`);
}

/**
 * Return organization SAML SSO configuration
 * @param req 
 * @param res 
 * @returns 
 */
export const getSSOConfig = async (req: Request, res: Response) => {
    const organizationId = req.query.organizationId as string;
    
    const data = await getSSOConfigHelper({
        organizationId: new Types.ObjectId(organizationId)
    });

    return res.status(200).send(data);
}

/**
 * Update organization SAML SSO configuration
 * @param req 
 * @param res 
 * @returns 
 */
export const updateSSOConfig = async (req: Request, res: Response) => {
    const {
        organizationId,
        authProvider,
        isActive,
        entryPoint,
        issuer,
        cert,
    } = req.body;

    const plan = await EELicenseService.getPlan(organizationId);
    
    if (!plan.samlSSO) return res.status(400).send({
        message: "Failed to update SAML SSO configuration due to plan restriction. Upgrade plan to update SSO configuration."
    });
    
    interface PatchUpdate {
        authProvider?: string;
        isActive?: boolean;
        encryptedEntryPoint?: string;
        entryPointIV?: string;
        entryPointTag?: string;
        encryptedIssuer?: string;
        issuerIV?: string;
        issuerTag?: string;
        encryptedCert?: string;
        certIV?: string;
        certTag?: string;
    }
    
    const update: PatchUpdate = {};
    
    if (authProvider) {
        update.authProvider = authProvider;
    }
    
    if (isActive !== undefined) {
        update.isActive = isActive;
    }
    
    const key = await BotOrgService.getSymmetricKey(
        new Types.ObjectId(organizationId)
    );
    
    if (entryPoint) {
        const {
            ciphertext: encryptedEntryPoint,
            iv: entryPointIV,
            tag: entryPointTag
        } = client.encryptSymmetric(entryPoint, key);
        
        update.encryptedEntryPoint = encryptedEntryPoint;
        update.entryPointIV = entryPointIV;
        update.entryPointTag = entryPointTag;
    }

    if (issuer) {
        const {
            ciphertext: encryptedIssuer,
            iv: issuerIV,
            tag: issuerTag
        } = client.encryptSymmetric(issuer, key);
        
        update.encryptedIssuer = encryptedIssuer;
        update.issuerIV = issuerIV;
        update.issuerTag = issuerTag;
    }

    if (cert) {
        const {
            ciphertext: encryptedCert,
            iv: certIV,
            tag: certTag
        } = client.encryptSymmetric(cert, key);
        
        update.encryptedCert = encryptedCert;
        update.certIV = certIV;
        update.certTag = certTag;
    }
    
    const ssoConfig = await SSOConfig.findOneAndUpdate(
        {
            organization: new Types.ObjectId(organizationId)
        },
        update,
        {
            new: true
        }
    );
    
    if (!ssoConfig) throw ResourceNotFoundError({
        message: "Failed to find SSO config to update"
    });
    
    if (update.isActive !== undefined) {
        const membershipOrgs = await MembershipOrg.find({
            organization: new Types.ObjectId(organizationId)
        }).select("user");
        
        if (update.isActive) {
            await User.updateMany(
                {
                    _id: {
                        $in: membershipOrgs.map((membershipOrg) => membershipOrg.user)
                    }
                },
                {
                    authProvider: ssoConfig.authProvider
                }
            );
        } else {
            await User.updateMany(
                {
                    _id: {
                        $in: membershipOrgs.map((membershipOrg) => membershipOrg.user)
                    }
                },
                {
                    $unset: {
                        authProvider: 1
                    }
                }
            );
        }
    }
    
    return res.status(200).send(ssoConfig);
}

/**
 * Create organization SAML SSO configuration
 * @param req 
 * @param res 
 * @returns 
 */
export const createSSOConfig = async (req: Request, res: Response) => {
    const {
        organizationId,
        authProvider,
        isActive,
        entryPoint,
        issuer,
        cert
    } = req.body;

    const plan = await EELicenseService.getPlan(organizationId);
    
    if (!plan.samlSSO) return res.status(400).send({
        message: "Failed to create SAML SSO configuration due to plan restriction. Upgrade plan to add SSO configuration."
    });
    
    const key = await BotOrgService.getSymmetricKey(
        new Types.ObjectId(organizationId)
    );

    const {
        ciphertext: encryptedEntryPoint,
        iv: entryPointIV,
        tag: entryPointTag
    } = client.encryptSymmetric(entryPoint, key);

    const {
        ciphertext: encryptedIssuer,
        iv: issuerIV,
        tag: issuerTag
    } = client.encryptSymmetric(issuer, key);

    const {
        ciphertext: encryptedCert,
        iv: certIV,
        tag: certTag
    } = client.encryptSymmetric(cert, key);
    
    const ssoConfig = await new SSOConfig({
        organization: new Types.ObjectId(organizationId),
        authProvider,
        isActive,
        encryptedEntryPoint,
        entryPointIV,
        entryPointTag,
        encryptedIssuer,
        issuerIV,
        issuerTag,
        encryptedCert,
        certIV,
        certTag
    }).save();

    return res.status(200).send(ssoConfig);
}