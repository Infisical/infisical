import { ForbiddenError } from "@casl/ability";
import { FastifyRequest } from "fastify";
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

import { TLicenseServiceFactory } from "../license/license-service";
import { OrgPermissionActions, OrgPermissionSubjects } from "../permission/org-permission";
import { TPermissionServiceFactory } from "../permission/permission-service";
import { TLdapConfigDALFactory } from "./ldap-config-dal";
import { TCreateLdapCfgDTO, TLdapLoginDTO, TUpdateLdapCfgDTO } from "./ldap-config-types";

// TODO: check the Picks
type TLdapConfigServiceFactoryDep = {
  ldapConfigDAL: TLdapConfigDALFactory;
  orgDAL: Pick<
    TOrgDALFactory,
    "createMembership" | "updateMembershipById" | "findMembership" | "findOrgById" | "findOne" | "updateById"
  >;
  orgBotDAL: Pick<TOrgBotDALFactory, "findOne" | "create" | "transaction">;
  userDAL: Pick<TUserDALFactory, "create" | "findOne" | "transaction" | "updateById">;
  permissionService: Pick<TPermissionServiceFactory, "getOrgPermission">;
  licenseService: Pick<TLicenseServiceFactory, "getPlan">;
};

export type TLdapConfigServiceFactory = ReturnType<typeof ldapConfigServiceFactory>;

export const ldapConfigServiceFactory = ({
  ldapConfigDAL,
  orgDAL,
  orgBotDAL,
  userDAL,
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
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Create, OrgPermissionSubjects.Sso);

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
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Edit, OrgPermissionSubjects.Sso);

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

    if (bindDN) {
      const { ciphertext: encryptedBindDN, iv: bindDNIV, tag: bindDNTag } = encryptSymmetric(bindDN, key);
      updateQuery.encryptedBindDN = encryptedBindDN;
      updateQuery.bindDNIV = bindDNIV;
      updateQuery.bindDNTag = bindDNTag;
    }

    if (bindPass) {
      const { ciphertext: encryptedBindPass, iv: bindPassIV, tag: bindPassTag } = encryptSymmetric(bindPass, key);
      updateQuery.encryptedBindPass = encryptedBindPass;
      updateQuery.bindPassIV = bindPassIV;
      updateQuery.bindPassTag = bindPassTag;
    }

    if (caCert) {
      const { ciphertext: encryptedCACert, iv: caCertIV, tag: caCertTag } = encryptSymmetric(caCert, key);
      updateQuery.encryptedCACert = encryptedCACert;
      updateQuery.caCertIV = caCertIV;
      updateQuery.caCertTag = caCertTag;
    }

    const [ldapConfig] = await ldapConfigDAL.update({ orgId }, updateQuery);

    return ldapConfig;
  };

  const getLdapCfg2 = async (orgId: string) => {
    const ldapConfig = await ldapConfigDAL.findOne({ orgId });
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

  const getLdapCfg = async ({ actor, actorId, orgId, actorOrgId }: TOrgPermission) => {
    const { permission } = await permissionService.getOrgPermission(actor, actorId, orgId, actorOrgId);
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Read, OrgPermissionSubjects.Sso);
    return getLdapCfg2(orgId);
  };

  // eslint-disable-next-line
  const getLDAPConfiguration = (req: FastifyRequest, callback: any) => {
    const { organizationSlug } = req.body as {
      organizationSlug: string;
    };

    const boot = async () => {
      const organization = await orgDAL.findOne({ slug: organizationSlug });
      const ldapConfig = await getLdapCfg2(organization.id); // repeat?
      req.ldapConfig = ldapConfig;

      const opts = {
        server: {
          url: ldapConfig.url,
          bindDN: ldapConfig.bindDN,
          bindCredentials: ldapConfig.bindPass,
          searchBase: ldapConfig.searchBase,
          searchFilter: "(uid={{username}})",
          searchAttributes: ["uid", "givenName", "sn"],
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

      // eslint-disable-next-line
      callback(null, opts);
    };

    process.nextTick(async () => {
      await boot();
    });
  };

  const ldapLogin = async ({ username, firstName, lastName, orgId, relayState }: TLdapLoginDTO) => {
    const appCfg = getConfig();
    let user = await userDAL.findOne({
      username,
      orgId
    });

    const organization = await orgDAL.findOrgById(orgId);
    if (!organization) throw new BadRequestError({ message: "Org not found" });

    if (user) {
      await userDAL.transaction(async (tx) => {
        const [orgMembership] = await orgDAL.findMembership({ userId: user.id, orgId }, { tx });
        if (!orgMembership) {
          await orgDAL.createMembership(
            {
              userId: user.id,
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
      user = await userDAL.transaction(async (tx) => {
        const newUser = await userDAL.create(
          {
            username,
            orgId,
            firstName,
            lastName,
            authMethods: [AuthMethod.EMAIL],
            isGhost: false
          },
          tx
        );
        await orgDAL.createMembership({
          orgId,
          role: OrgMembershipRole.Member,
          status: OrgMembershipStatus.Invited // should this be invited?
        });
        return newUser;
      });
    }

    const isUserCompleted = Boolean(user.isAccepted);

    const providerAuthToken = jwt.sign(
      {
        authTokenType: AuthTokenType.PROVIDER_TOKEN,
        userId: user.id,
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
    getLdapCfg,
    getLDAPConfiguration,
    ldapLogin
  };
};
