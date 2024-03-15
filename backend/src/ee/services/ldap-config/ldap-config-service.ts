import { ForbiddenError } from "@casl/ability";
import jwt from "jsonwebtoken";

import { OrgMembershipRole, OrgMembershipStatus, SecretKeyEncoding, TLdapConfigsUpdate } from "@app/db/schemas";
import { getConfig } from "@app/lib/config/env";
import {
  decryptSymmetric,
  encryptSymmetric,
  generateAsymmetricKeyPair,
  generateSymmetricKey,
  infisicalSymmetricDecrypt,
  infisicalSymmetricEncypt
} from "@app/lib/crypto/encryption";
import { BadRequestError } from "@app/lib/errors";
import { TOrgPermission } from "@app/lib/types";
import { AuthMethod, AuthTokenType } from "@app/services/auth/auth-type";
import { TOrgBotDALFactory } from "@app/services/org/org-bot-dal";
import { TOrgDALFactory } from "@app/services/org/org-dal";
import { TUserDALFactory } from "@app/services/user/user-dal";
import { normalizeUsername } from "@app/services/user/user-fns";
import { TUserAliasDALFactory } from "@app/services/user-alias/user-alias-dal";

import { TLicenseServiceFactory } from "../license/license-service";
import { OrgPermissionActions, OrgPermissionSubjects } from "../permission/org-permission";
import { TPermissionServiceFactory } from "../permission/permission-service";
import { TLdapConfigDALFactory } from "./ldap-config-dal";
import { TCreateLdapCfgDTO, TLdapLoginDTO, TUpdateLdapCfgDTO } from "./ldap-config-types";

type TLdapConfigServiceFactoryDep = {
  ldapConfigDAL: TLdapConfigDALFactory;
  orgDAL: Pick<
    TOrgDALFactory,
    "createMembership" | "updateMembershipById" | "findMembership" | "findOrgById" | "findOne" | "updateById"
  >;
  orgBotDAL: Pick<TOrgBotDALFactory, "findOne" | "create" | "transaction">;
  userDAL: Pick<TUserDALFactory, "create" | "findOne" | "transaction" | "updateById">;
  userAliasDAL: Pick<TUserAliasDALFactory, "create" | "findOne">;
  permissionService: Pick<TPermissionServiceFactory, "getOrgPermission">;
  licenseService: Pick<TLicenseServiceFactory, "getPlan">;
};

export type TLdapConfigServiceFactory = ReturnType<typeof ldapConfigServiceFactory>;

export const ldapConfigServiceFactory = ({
  ldapConfigDAL,
  orgDAL,
  orgBotDAL,
  userDAL,
  userAliasDAL,
  permissionService,
  licenseService
}: TLdapConfigServiceFactoryDep) => {
  const createLdapCfg = async ({
    actor,
    actorId,
    orgId,
    actorOrgId,
    isActive,
    url,
    bindDN,
    bindPass,
    searchBase,
    caCert
  }: TCreateLdapCfgDTO) => {
    const { permission } = await permissionService.getOrgPermission(actor, actorId, orgId, actorOrgId);
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Create, OrgPermissionSubjects.Ldap);

    const plan = await licenseService.getPlan(orgId);
    if (!plan.ldap)
      throw new BadRequestError({
        message:
          "Failed to create LDAP configuration due to plan restriction. Upgrade plan to create LDAP configuration."
      });

    const orgBot = await orgBotDAL.transaction(async (tx) => {
      const doc = await orgBotDAL.findOne({ orgId }, tx);
      if (doc) return doc;

      const { privateKey, publicKey } = generateAsymmetricKeyPair();
      const key = generateSymmetricKey();
      const {
        ciphertext: encryptedPrivateKey,
        iv: privateKeyIV,
        tag: privateKeyTag,
        encoding: privateKeyKeyEncoding,
        algorithm: privateKeyAlgorithm
      } = infisicalSymmetricEncypt(privateKey);
      const {
        ciphertext: encryptedSymmetricKey,
        iv: symmetricKeyIV,
        tag: symmetricKeyTag,
        encoding: symmetricKeyKeyEncoding,
        algorithm: symmetricKeyAlgorithm
      } = infisicalSymmetricEncypt(key);

      return orgBotDAL.create(
        {
          name: "Infisical org bot",
          publicKey,
          privateKeyIV,
          encryptedPrivateKey,
          symmetricKeyIV,
          symmetricKeyTag,
          encryptedSymmetricKey,
          symmetricKeyAlgorithm,
          orgId,
          privateKeyTag,
          privateKeyAlgorithm,
          privateKeyKeyEncoding,
          symmetricKeyKeyEncoding
        },
        tx
      );
    });

    const key = infisicalSymmetricDecrypt({
      ciphertext: orgBot.encryptedSymmetricKey,
      iv: orgBot.symmetricKeyIV,
      tag: orgBot.symmetricKeyTag,
      keyEncoding: orgBot.symmetricKeyKeyEncoding as SecretKeyEncoding
    });

    const { ciphertext: encryptedBindDN, iv: bindDNIV, tag: bindDNTag } = encryptSymmetric(bindDN, key);
    const { ciphertext: encryptedBindPass, iv: bindPassIV, tag: bindPassTag } = encryptSymmetric(bindPass, key);
    const { ciphertext: encryptedCACert, iv: caCertIV, tag: caCertTag } = encryptSymmetric(caCert, key);

    const ldapConfig = await ldapConfigDAL.create({
      orgId,
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
    });

    return ldapConfig;
  };

  const updateLdapCfg = async ({
    actor,
    actorId,
    orgId,
    actorOrgId,
    isActive,
    url,
    bindDN,
    bindPass,
    searchBase,
    caCert
  }: TUpdateLdapCfgDTO) => {
    const { permission } = await permissionService.getOrgPermission(actor, actorId, orgId, actorOrgId);
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Edit, OrgPermissionSubjects.Ldap);

    const plan = await licenseService.getPlan(orgId);
    if (!plan.ldap)
      throw new BadRequestError({
        message:
          "Failed to update LDAP configuration due to plan restriction. Upgrade plan to update LDAP configuration."
      });

    const updateQuery: TLdapConfigsUpdate = {
      isActive,
      url,
      searchBase
    };

    const orgBot = await orgBotDAL.findOne({ orgId });
    if (!orgBot) throw new BadRequestError({ message: "Org bot not found", name: "OrgBotNotFound" });
    const key = infisicalSymmetricDecrypt({
      ciphertext: orgBot.encryptedSymmetricKey,
      iv: orgBot.symmetricKeyIV,
      tag: orgBot.symmetricKeyTag,
      keyEncoding: orgBot.symmetricKeyKeyEncoding as SecretKeyEncoding
    });

    if (bindDN !== undefined) {
      const { ciphertext: encryptedBindDN, iv: bindDNIV, tag: bindDNTag } = encryptSymmetric(bindDN, key);
      updateQuery.encryptedBindDN = encryptedBindDN;
      updateQuery.bindDNIV = bindDNIV;
      updateQuery.bindDNTag = bindDNTag;
    }

    if (bindPass !== undefined) {
      const { ciphertext: encryptedBindPass, iv: bindPassIV, tag: bindPassTag } = encryptSymmetric(bindPass, key);
      updateQuery.encryptedBindPass = encryptedBindPass;
      updateQuery.bindPassIV = bindPassIV;
      updateQuery.bindPassTag = bindPassTag;
    }

    if (caCert !== undefined) {
      const { ciphertext: encryptedCACert, iv: caCertIV, tag: caCertTag } = encryptSymmetric(caCert, key);
      updateQuery.encryptedCACert = encryptedCACert;
      updateQuery.caCertIV = caCertIV;
      updateQuery.caCertTag = caCertTag;
    }

    const [ldapConfig] = await ldapConfigDAL.update({ orgId }, updateQuery);

    return ldapConfig;
  };

  const getLdapCfg = async (filter: { orgId: string; isActive?: boolean }) => {
    const ldapConfig = await ldapConfigDAL.findOne(filter);
    if (!ldapConfig) throw new BadRequestError({ message: "Failed to find organization LDAP data" });

    const orgBot = await orgBotDAL.findOne({ orgId: ldapConfig.orgId });
    if (!orgBot) throw new BadRequestError({ message: "Org bot not found", name: "OrgBotNotFound" });

    const key = infisicalSymmetricDecrypt({
      ciphertext: orgBot.encryptedSymmetricKey,
      iv: orgBot.symmetricKeyIV,
      tag: orgBot.symmetricKeyTag,
      keyEncoding: orgBot.symmetricKeyKeyEncoding as SecretKeyEncoding
    });

    const {
      encryptedBindDN,
      bindDNIV,
      bindDNTag,
      encryptedBindPass,
      bindPassIV,
      bindPassTag,
      encryptedCACert,
      caCertIV,
      caCertTag
    } = ldapConfig;

    let bindDN = "";
    if (encryptedBindDN && bindDNIV && bindDNTag) {
      bindDN = decryptSymmetric({
        ciphertext: encryptedBindDN,
        key,
        tag: bindDNTag,
        iv: bindDNIV
      });
    }

    let bindPass = "";
    if (encryptedBindPass && bindPassIV && bindPassTag) {
      bindPass = decryptSymmetric({
        ciphertext: encryptedBindPass,
        key,
        tag: bindPassTag,
        iv: bindPassIV
      });
    }

    let caCert = "";
    if (encryptedCACert && caCertIV && caCertTag) {
      caCert = decryptSymmetric({
        ciphertext: encryptedCACert,
        key,
        tag: caCertTag,
        iv: caCertIV
      });
    }

    return {
      id: ldapConfig.id,
      organization: ldapConfig.orgId,
      isActive: ldapConfig.isActive,
      url: ldapConfig.url,
      bindDN,
      bindPass,
      searchBase: ldapConfig.searchBase,
      caCert
    };
  };

  const getLdapCfgWithPermissionCheck = async ({ actor, actorId, orgId, actorOrgId }: TOrgPermission) => {
    const { permission } = await permissionService.getOrgPermission(actor, actorId, orgId, actorOrgId);
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Read, OrgPermissionSubjects.Ldap);
    return getLdapCfg({
      orgId
    });
  };

  const bootLdap = async (organizationSlug: string) => {
    const organization = await orgDAL.findOne({ slug: organizationSlug });
    if (!organization) throw new BadRequestError({ message: "Org not found" });

    const ldapConfig = await getLdapCfg({
      orgId: organization.id,
      isActive: true
    });

    const opts = {
      server: {
        url: ldapConfig.url,
        bindDN: ldapConfig.bindDN,
        bindCredentials: ldapConfig.bindPass,
        searchBase: ldapConfig.searchBase,
        searchFilter: "(uid={{username}})",
        searchAttributes: ["uid", "uidNumber", "givenName", "sn", "mail"],
        ...(ldapConfig.caCert !== ""
          ? {
              tlsOptions: {
                ca: [ldapConfig.caCert]
              }
            }
          : {})
      },
      passReqToCallback: true
    };

    return { opts, ldapConfig };
  };

  const ldapLogin = async ({ externalId, username, firstName, lastName, emails, orgId, relayState }: TLdapLoginDTO) => {
    const appCfg = getConfig();
    let userAlias = await userAliasDAL.findOne({
      externalId,
      orgId,
      aliasType: AuthMethod.LDAP
    });

    const organization = await orgDAL.findOrgById(orgId);
    if (!organization) throw new BadRequestError({ message: "Org not found" });

    if (userAlias) {
      await userDAL.transaction(async (tx) => {
        const [orgMembership] = await orgDAL.findMembership({ userId: userAlias.userId }, { tx });
        if (!orgMembership) {
          await orgDAL.createMembership(
            {
              userId: userAlias.userId,
              orgId,
              role: OrgMembershipRole.Member,
              status: OrgMembershipStatus.Accepted
            },
            tx
          );
        } else if (orgMembership.status === OrgMembershipStatus.Invited) {
          await orgDAL.updateMembershipById(
            orgMembership.id,
            {
              status: OrgMembershipStatus.Accepted
            },
            tx
          );
        }
      });
    } else {
      userAlias = await userDAL.transaction(async (tx) => {
        const uniqueUsername = await normalizeUsername(username, userDAL);
        const newUser = await userDAL.create(
          {
            username: uniqueUsername,
            email: emails[0],
            firstName,
            lastName,
            authMethods: [AuthMethod.LDAP],
            isGhost: false
          },
          tx
        );
        const newUserAlias = await userAliasDAL.create(
          {
            userId: newUser.id,
            username,
            aliasType: AuthMethod.LDAP,
            externalId,
            emails,
            orgId
          },
          tx
        );

        await orgDAL.createMembership(
          {
            userId: newUser.id,
            orgId,
            role: OrgMembershipRole.Member,
            status: OrgMembershipStatus.Invited
          },
          tx
        );

        return newUserAlias;
      });
    }

    const user = await userDAL.findOne({ id: userAlias.userId });

    const isUserCompleted = Boolean(user.isAccepted);

    const providerAuthToken = jwt.sign(
      {
        authTokenType: AuthTokenType.PROVIDER_TOKEN,
        userId: user.id,
        username: user.username,
        firstName,
        lastName,
        organizationName: organization.name,
        organizationId: organization.id,
        authMethod: AuthMethod.LDAP,
        isUserCompleted,
        ...(relayState
          ? {
              callbackPort: (JSON.parse(relayState) as { callbackPort: string }).callbackPort
            }
          : {})
      },
      appCfg.AUTH_SECRET,
      {
        expiresIn: appCfg.JWT_PROVIDER_AUTH_LIFETIME
      }
    );

    return { isUserCompleted, providerAuthToken };
  };

  return {
    createLdapCfg,
    updateLdapCfg,
    getLdapCfgWithPermissionCheck,
    getLdapCfg,
    // getLdapPassportOpts,
    ldapLogin,
    bootLdap
  };
};
