import { ForbiddenError } from "@casl/ability";
import jwt from "jsonwebtoken";

import {
  OrgMembershipRole,
  OrgMembershipStatus,
  SecretKeyEncoding,
  TableName,
  TSamlConfigs,
  TSamlConfigsUpdate
} from "@app/db/schemas";
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
import { AuthMethod, AuthTokenType } from "@app/services/auth/auth-type";
import { TOrgBotDALFactory } from "@app/services/org/org-bot-dal";
import { TOrgDALFactory } from "@app/services/org/org-dal";
import { TUserDALFactory } from "@app/services/user/user-dal";

import { TLicenseServiceFactory } from "../license/license-service";
import { OrgPermissionActions, OrgPermissionSubjects } from "../permission/org-permission";
import { TPermissionServiceFactory } from "../permission/permission-service";
import { TSamlConfigDALFactory } from "./saml-config-dal";
import { TCreateSamlCfgDTO, TGetSamlCfgDTO, TSamlLoginDTO, TUpdateSamlCfgDTO } from "./saml-config-types";

type TSamlConfigServiceFactoryDep = {
  samlConfigDAL: TSamlConfigDALFactory;
  userDAL: Pick<TUserDALFactory, "create" | "findOne" | "transaction" | "updateById">;
  orgDAL: Pick<
    TOrgDALFactory,
    "createMembership" | "updateMembershipById" | "findMembership" | "findOrgById" | "findOne" | "updateById"
  >;
  orgBotDAL: Pick<TOrgBotDALFactory, "findOne" | "create" | "transaction">;
  permissionService: Pick<TPermissionServiceFactory, "getOrgPermission">;
  licenseService: Pick<TLicenseServiceFactory, "getPlan">;
};

export type TSamlConfigServiceFactory = ReturnType<typeof samlConfigServiceFactory>;

export const samlConfigServiceFactory = ({
  samlConfigDAL,
  orgBotDAL,
  orgDAL,
  userDAL,
  permissionService,
  licenseService
}: TSamlConfigServiceFactoryDep) => {
  const createSamlCfg = async ({
    cert,
    actor,
    actorAuthMethod,
    actorOrgId,
    orgId,
    issuer,
    actorId,
    isActive,
    entryPoint,
    authProvider
  }: TCreateSamlCfgDTO) => {
    const { permission } = await permissionService.getOrgPermission(actor, actorId, orgId, actorAuthMethod, actorOrgId);
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Create, OrgPermissionSubjects.Sso);

    const plan = await licenseService.getPlan(orgId);
    if (!plan.samlSSO)
      throw new BadRequestError({
        message:
          "Failed to create SAML SSO configuration due to plan restriction. Upgrade plan to create SSO configuration."
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

    const { ciphertext: encryptedEntryPoint, iv: entryPointIV, tag: entryPointTag } = encryptSymmetric(entryPoint, key);
    const { ciphertext: encryptedIssuer, iv: issuerIV, tag: issuerTag } = encryptSymmetric(issuer, key);
    const { ciphertext: encryptedCert, iv: certIV, tag: certTag } = encryptSymmetric(cert, key);
    const samlConfig = await samlConfigDAL.create({
      orgId,
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
    });

    return samlConfig;
  };

  const updateSamlCfg = async ({
    orgId,
    actor,
    actorOrgId,
    actorAuthMethod,
    cert,
    actorId,
    issuer,
    isActive,
    entryPoint,
    authProvider
  }: TUpdateSamlCfgDTO) => {
    const { permission } = await permissionService.getOrgPermission(actor, actorId, orgId, actorAuthMethod, actorOrgId);
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Edit, OrgPermissionSubjects.Sso);
    const plan = await licenseService.getPlan(orgId);
    if (!plan.samlSSO)
      throw new BadRequestError({
        message:
          "Failed to update SAML SSO configuration due to plan restriction. Upgrade plan to update SSO configuration."
      });

    const updateQuery: TSamlConfigsUpdate = { authProvider, isActive, lastUsed: null };
    const orgBot = await orgBotDAL.findOne({ orgId });
    if (!orgBot) throw new BadRequestError({ message: "Org bot not found", name: "OrgBotNotFound" });
    const key = infisicalSymmetricDecrypt({
      ciphertext: orgBot.encryptedSymmetricKey,
      iv: orgBot.symmetricKeyIV,
      tag: orgBot.symmetricKeyTag,
      keyEncoding: orgBot.symmetricKeyKeyEncoding as SecretKeyEncoding
    });

    if (entryPoint !== undefined) {
      const {
        ciphertext: encryptedEntryPoint,
        iv: entryPointIV,
        tag: entryPointTag
      } = encryptSymmetric(entryPoint, key);
      updateQuery.encryptedEntryPoint = encryptedEntryPoint;
      updateQuery.entryPointIV = entryPointIV;
      updateQuery.entryPointTag = entryPointTag;
    }
    if (issuer !== undefined) {
      const { ciphertext: encryptedIssuer, iv: issuerIV, tag: issuerTag } = encryptSymmetric(issuer, key);
      updateQuery.encryptedIssuer = encryptedIssuer;
      updateQuery.issuerIV = issuerIV;
      updateQuery.issuerTag = issuerTag;
    }
    if (cert !== undefined) {
      const { ciphertext: encryptedCert, iv: certIV, tag: certTag } = encryptSymmetric(cert, key);
      updateQuery.encryptedCert = encryptedCert;
      updateQuery.certIV = certIV;
      updateQuery.certTag = certTag;
    }

    const [ssoConfig] = await samlConfigDAL.update({ orgId }, updateQuery);
    await orgDAL.updateById(orgId, { authEnforced: false, scimEnabled: false });

    return ssoConfig;
  };

  const getSaml = async (dto: TGetSamlCfgDTO) => {
    let ssoConfig: TSamlConfigs | undefined;
    if (dto.type === "org") {
      ssoConfig = await samlConfigDAL.findOne({ orgId: dto.orgId });
      if (!ssoConfig) return;
    } else if (dto.type === "orgSlug") {
      const org = await orgDAL.findOne({ slug: dto.orgSlug });
      if (!org) return;
      ssoConfig = await samlConfigDAL.findOne({ orgId: org.id });
    } else if (dto.type === "ssoId") {
      // TODO:
      // We made this change because saml config ids were not moved over during the migration
      // This will patch this issue.
      // Remove in the future
      const UUIDToMongoId: Record<string, string> = {
        "64c81ff7905fadcfead01e9a": "0978bcbe-8f94-4d95-8600-009787262613",
        "652d4777c74d008c85c8bed5": "42044bf5-119e-443e-a51b-0308ac7e45ea",
        "6527df39771217236f8721f6": "6311ec4b-d692-4422-b52a-337f719ae6b0",
        "650374a561d12cd3d835aeb8": "6453516c-930d-4ff0-ad3b-496ba6eb80ca",
        "655d67d10a0f4d307c8b1536": "73b9f1b1-f946-4f18-9a2d-310f157f7df5",
        "64f23239a5d4ed17f1e544c4": "9256337f-e3da-43d7-8266-39c9276e8426",
        "65348e49db355e6e4782571f": "b8a227c7-843e-410e-8982-b4976a599b69",
        "657a219fc8a80c2eff97eb38": "fcab1573-ae7f-4fcf-9645-646207acf035"
      };

      const id = UUIDToMongoId[dto.id] ?? dto.id;

      ssoConfig = await samlConfigDAL.findById(id);
    }
    if (!ssoConfig) throw new BadRequestError({ message: "Failed to find organization SSO data" });

    // when dto is type id means it's internally used
    if (dto.type === "org") {
      const { permission } = await permissionService.getOrgPermission(
        dto.actor,
        dto.actorId,
        ssoConfig.orgId,
        dto.actorAuthMethod,
        dto.actorOrgId
      );
      ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Read, OrgPermissionSubjects.Sso);
    }
    const {
      entryPointTag,
      entryPointIV,
      encryptedEntryPoint,
      certTag,
      certIV,
      encryptedCert,
      issuerTag,
      issuerIV,
      encryptedIssuer
    } = ssoConfig;

    const orgBot = await orgBotDAL.findOne({ orgId: ssoConfig.orgId });
    if (!orgBot) throw new BadRequestError({ message: "Org bot not found", name: "OrgBotNotFound" });
    const key = infisicalSymmetricDecrypt({
      ciphertext: orgBot.encryptedSymmetricKey,
      iv: orgBot.symmetricKeyIV,
      tag: orgBot.symmetricKeyTag,
      keyEncoding: orgBot.symmetricKeyKeyEncoding as SecretKeyEncoding
    });

    let entryPoint = "";
    if (encryptedEntryPoint && entryPointIV && entryPointTag) {
      entryPoint = decryptSymmetric({
        ciphertext: encryptedEntryPoint,
        key,
        tag: entryPointTag,
        iv: entryPointIV
      });
    }

    let issuer = "";
    if (encryptedIssuer && issuerTag && issuerIV) {
      issuer = decryptSymmetric({
        key,
        tag: issuerTag,
        iv: issuerIV,
        ciphertext: encryptedIssuer
      });
    }

    let cert = "";
    if (encryptedCert && certTag && certIV) {
      cert = decryptSymmetric({ key, tag: certTag, iv: certIV, ciphertext: encryptedCert });
    }

    return {
      id: ssoConfig.id,
      organization: ssoConfig.orgId,
      orgId: ssoConfig.orgId,
      authProvider: ssoConfig.authProvider,
      isActive: ssoConfig.isActive,
      entryPoint,
      issuer,
      cert,
      lastUsed: ssoConfig.lastUsed
    };
  };

  const samlLogin = async ({
    username,
    email,
    firstName,
    lastName,
    authProvider,
    orgId,
    relayState
  }: TSamlLoginDTO) => {
    const appCfg = getConfig();
    let user = await userDAL.findOne({ username });

    const organization = await orgDAL.findOrgById(orgId);
    if (!organization) throw new BadRequestError({ message: "Org not found" });

    if (user) {
      await userDAL.transaction(async (tx) => {
        const [orgMembership] = await orgDAL.findMembership(
          {
            userId: user.id,
            [`${TableName.OrgMembership}.orgId` as "id"]: orgId
          },
          { tx }
        );
        if (!orgMembership) {
          await orgDAL.createMembership(
            {
              userId: user.id,
              orgId,
              inviteEmail: email,
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
            email,
            firstName,
            lastName,
            authMethods: [AuthMethod.EMAIL],
            isGhost: false
          },
          tx
        );
        await orgDAL.createMembership({
          inviteEmail: email,
          orgId,
          role: OrgMembershipRole.Member,
          status: OrgMembershipStatus.Invited
        });
        return newUser;
      });
    }
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
        authMethod: authProvider,
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

    await samlConfigDAL.update({ orgId }, { lastUsed: new Date() });

    return { isUserCompleted, providerAuthToken };
  };

  return {
    createSamlCfg,
    updateSamlCfg,
    getSaml,
    samlLogin
  };
};
