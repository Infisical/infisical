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

export const getSSOConfig = async (req: Request, res: Response) => {
    const organizationId = req.query.organizationId as string;
    
    const data = await getSSOConfigHelper({
        organizationId: new Types.ObjectId(organizationId)
    });

    return res.status(200).send(data);
}

export const updateSSOConfig = async (req: Request, res: Response) => {
    const {
        organizationId,
        authProvider,
        isActive,
        entryPoint,
        issuer,
        cert,
        audience
    } = req.body;
    
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
        encryptedAudience?: string;
        audienceIV?: string;
        audienceTag?: string;
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

    if (audience) {
        const {
            ciphertext: encryptedAudience,
            iv: audienceIV,
            tag: audienceTag
        } = client.encryptSymmetric(audience, key);
        
        update.encryptedAudience = encryptedAudience;
        update.audienceIV = audienceIV;
        update.audienceTag = audienceTag;
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

export const createSSOConfig = async (req: Request, res: Response) => {
    const {
        organizationId,
        authProvider,
        isActive,
        entryPoint,
        issuer,
        cert,
        audience
    } = req.body;
    
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

    const {
        ciphertext: encryptedAudience,
        iv: audienceIV,
        tag: audienceTag
    } = client.encryptSymmetric(audience, key);
    
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
        certTag,
        encryptedAudience,
        audienceIV,
        audienceTag
    }).save();

    return res.status(200).send(ssoConfig);
}