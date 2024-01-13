import { Request, Response } from "express";
import { Types } from "mongoose";
import { client, getSiteURL } from "../../config";
import * as reqValidator from "../../validation/ldap";
import { validateRequest } from "../../helpers/validation";
import { getLdapConfigHelper } from "../../ee/helpers/organizations";
import {
  OrgPermissionActions,
  OrgPermissionSubjects,
  getAuthDataOrgPermissions
} from "../../ee/services/RoleService";
import { ForbiddenError } from "@casl/ability";
import { LDAPConfig } from "../../ee/models";
import { BotOrgService } from "../../services";

/**
 * Return appropriate SSO endpoint after successful authentication with LDAP
 * to finish inputting their master key for logging in or signing up
 * @param req
 * @param res 
 * @returns 
 */
export const redirectLDAP = async (req: Request, res: Response) => {
    let nextUrl;
    if (req.isUserCompleted) {
        nextUrl = `${await getSiteURL()}/login/sso?token=${encodeURIComponent(req.providerAuthToken)}`;
    } else {
        nextUrl = `${await getSiteURL()}/signup/sso?token=${encodeURIComponent(req.providerAuthToken)}`
    }

    return res.status(200).send({
        nextUrl
    });
}

/**
 * Return organization LDAP configuration
 * @param req 
 * @param res 
 */
export const getLDAPConfig = async (req: Request, res: Response) => {
    const  {
        query: { organizationId }
    } = await validateRequest(reqValidator.GetLdapConfigv1, req);
    
    const { permission } = await getAuthDataOrgPermissions({
        authData: req.authData,
        organizationId: new Types.ObjectId(organizationId)
    });
      
    ForbiddenError.from(permission).throwUnlessCan(
        OrgPermissionActions.Read,
        OrgPermissionSubjects.Sso
    );
    
    const data = await getLdapConfigHelper({
        organizationId: new Types.ObjectId(organizationId)
    });

    return res.status(200).send(data);
}

/**
 * Update organization LDAP configuration
 * @param req 
 * @param res 
 * @returns 
 */
export const updateLDAPConfig = async (req: Request, res: Response) => {
    const {
        body: {
            organizationId,
            isActive,
            url,
            bindDN,
            bindPass,
            searchBase,
            caCert
        }
    } = await validateRequest(reqValidator.UpdateLdapConfigv1, req);
    
    const { permission } = await getAuthDataOrgPermissions({
        authData: req.authData,
        organizationId: new Types.ObjectId(organizationId)
    });
    
    ForbiddenError.from(permission).throwUnlessCan(
        OrgPermissionActions.Edit,
        OrgPermissionSubjects.Sso
    );
    
    interface PatchUpdate {
        isActive?: boolean;
        url?: string;
        encryptedBindDN?: string;
        bindDNIV?: string;
        bindDNTag?: string;
        encryptedBindPass?: string;
        bindPassIV?: string;
        bindPassTag?: string;
        searchBase?: string;
        encryptedCACert?: string;
        caCertIV?: string;
        caCertTag?: string;
    }
    
    const update: PatchUpdate = {};

    if (url) {
        update.url = url;
    }

    if (searchBase) {
        update.searchBase = searchBase;
    }
    
    if (isActive !== undefined) {
        update.isActive = isActive;
    }
    
    const key = await BotOrgService.getSymmetricKey(new Types.ObjectId(organizationId));

    if (bindDN) {
        const {
            ciphertext: encryptedBindDN,
            iv: bindDNIV,
            tag: bindDNTag
        } = client.encryptSymmetric(bindDN, key);
        
        update.encryptedBindDN = encryptedBindDN;
        update.bindDNIV = bindDNIV;
        update.bindDNTag = bindDNTag;
    }

    if (bindPass) {
        const {
            ciphertext: encryptedBindPass,
            iv: bindPassIV,
            tag: bindPassTag
        } = client.encryptSymmetric(bindPass, key);
        
        update.encryptedBindPass = encryptedBindPass;
        update.bindPassIV = bindPassIV;
        update.bindPassTag = bindPassTag;
    }
    
    if (caCert) {
        const {
            ciphertext: encryptedCACert,
            iv: caCertIV,
            tag: caCertTag
        } = client.encryptSymmetric(caCert, key);
        
        update.encryptedCACert = encryptedCACert;
        update.caCertIV = caCertIV;
        update.caCertTag = caCertTag;
    }

    const ldapConfig = await LDAPConfig.findOneAndUpdate(
        { organization: new Types.ObjectId(organizationId) },
        update,
        { new: true }
    );

    return res.status(200).send(ldapConfig);
}

/**
 * Create organization LDAP configuration
 * @param req 
 * @param res 
 */
export const createLDAPConfig = async (req: Request, res: Response) => {
    const {
        body: {
            organizationId,
            isActive,
            url,
            bindDN,
            bindPass,
            searchBase,
            caCert
        }
    } = await validateRequest(reqValidator.CreateLdapConfigv1, req);

    const { permission } = await getAuthDataOrgPermissions({
        authData: req.authData,
        organizationId: new Types.ObjectId(organizationId)
    });
    
    ForbiddenError.from(permission).throwUnlessCan(
        OrgPermissionActions.Create,
        OrgPermissionSubjects.Sso
    );
    
    const key = await BotOrgService.getSymmetricKey(new Types.ObjectId(organizationId));
    
    const {
        ciphertext: encryptedBindDN,
        iv: bindDNIV,
        tag: bindDNTag
    } = client.encryptSymmetric(bindDN, key);
    
    const {
        ciphertext: encryptedBindPass,
        iv: bindPassIV,
        tag: bindPassTag
    } = client.encryptSymmetric(bindPass, key);

    const {
        ciphertext: encryptedCACert,
        iv: caCertIV,
        tag: caCertTag
    } = client.encryptSymmetric(caCert, key);
    
    const ldapConfig = await new LDAPConfig({
        organization: new Types.ObjectId(organizationId),
        isActive,
        url,
        encryptedBindDN,
        bindDNIV,
        bindDNTag,
        encryptedBindPass,
        bindPassIV,
        bindPassTag,
        searchBase,
        encryptedCACert,
        caCertIV,
        caCertTag
    }).save();

    return res.status(200).send(ldapConfig);
}