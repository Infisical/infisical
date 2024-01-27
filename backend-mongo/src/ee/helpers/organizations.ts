import { Types } from "mongoose";
import {
    SSOConfig
} from "../models";
import {
    BotOrgService
} from "../../services";
import { client } from "../../config";
import { ValidationError } from "../../utils/errors";

export const getSSOConfigHelper = async ({
    organizationId,
    ssoConfigId
}: {
    organizationId?: Types.ObjectId;
    ssoConfigId?: Types.ObjectId;
}) => {
    
    if (!organizationId && !ssoConfigId) throw ValidationError({
        message: "Getting SSO data requires either id of organization or SSO data"
    });
    
    const ssoConfig = await SSOConfig.findOne({
        ...(organizationId ? { organization: organizationId } : {}),
        ...(ssoConfigId ? { _id: ssoConfigId } : {})
    });
    
    if (!ssoConfig) throw new Error("Failed to find organization SSO data");
    
    const key = await BotOrgService.getSymmetricKey(
        ssoConfig.organization
    );
    
    const entryPoint = client.decryptSymmetric(
        ssoConfig.encryptedEntryPoint,
        key,
        ssoConfig.entryPointIV,
        ssoConfig.entryPointTag
    );

    const issuer = client.decryptSymmetric(
        ssoConfig.encryptedIssuer,
        key,
        ssoConfig.issuerIV,
        ssoConfig.issuerTag
    );

    const cert = client.decryptSymmetric(
        ssoConfig.encryptedCert,
        key,
        ssoConfig.certIV,
        ssoConfig.certTag
    );
    
    return ({
        _id: ssoConfig._id,
        organization: ssoConfig.organization,
        authProvider: ssoConfig.authProvider,
        isActive: ssoConfig.isActive,
        entryPoint,
        issuer,
        cert
    });
}