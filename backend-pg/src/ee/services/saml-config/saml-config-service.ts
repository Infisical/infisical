import { ForbiddenError } from "@casl/ability";
import jwt from "jsonwebtoken";

import {
  OrgMembershipRole,
  OrgMembershipStatus,
  SecretKeyEncoding,
  TSamlConfigs,
  TSamlConfigsUpdate
} from "@app/db/schemas";
import { getConfig } from "@app/lib/config/env";
import {
  decryptSymmetric,
  encryptSymmetric,
  infisicalSymmetricDecrypt
} from "@app/lib/crypto/encryption";
import { BadRequestError } from "@app/lib/errors";
import { AuthTokenType } from "@app/services/auth/auth-type";
import { TOrgBotDalFactory } from "@app/services/org/org-bot-dal";
import { TOrgDalFactory } from "@app/services/org/org-dal";
import { TUserDalFactory } from "@app/services/user/user-dal";

import { TLicenseServiceFactory } from "../license/license-service";
import { OrgPermissionActions, OrgPermissionSubjects } from "../permission/org-permission";
import { TPermissionServiceFactory } from "../permission/permission-service";
import { TSamlConfigDalFactory } from "./saml-config-dal";
import {
  SamlProviders,
  TCreateSamlCfgDTO,
  TGetSamlCfgDTO,
  TSamlLoginDTO,
  TUpdateSamlCfgDTO
} from "./saml-config-types";

type TSamlConfigServiceFactoryDep = {
  samlConfigDal: TSamlConfigDalFactory;
  userDal: Pick<TUserDalFactory, "create" | "findUserByEmail" | "transaction" | "updateById">;
  orgDal: Pick<
    TOrgDalFactory,
    "createMembership" | "updateMembershipById" | "findMembership" | "findOrgById"
  >;
  orgBotDal: Pick<TOrgBotDalFactory, "findOne">;
  permissionService: Pick<TPermissionServiceFactory, "getOrgPermission">;
  licenseService: Pick<TLicenseServiceFactory, "getPlan">;
};

export type TSamlConfigServiceFactory = ReturnType<typeof samlConfigServiceFactory>;

export const samlConfigServiceFactory = ({
  samlConfigDal,
  orgBotDal,
  orgDal,
  userDal,
  permissionService,
  licenseService
}: TSamlConfigServiceFactoryDep) => {
  const createSamlCfg = async ({
    cert,
    actor,
    orgId,
    issuer,
    actorId,
    isActive,
    entryPoint,
    authProvider
  }: TCreateSamlCfgDTO) => {
    const { permission } = await permissionService.getOrgPermission(actor, actorId, orgId);
    ForbiddenError.from(permission).throwUnlessCan(
      OrgPermissionActions.Create,
      OrgPermissionSubjects.Sso
    );

    const plan = await licenseService.getPlan(orgId);
    if (!plan.samlSSO)
      throw new BadRequestError({
        message:
          "Failed to update SAML SSO configuration due to plan restriction. Upgrade plan to update SSO configuration."
      });

    const orgBot = await orgBotDal.findOne({ orgId });
    if (!orgBot)
      throw new BadRequestError({ message: "Org bot not found", name: "OrgBotNotFound" });
    const key = infisicalSymmetricDecrypt({
      ciphertext: orgBot.encryptedSymmetricKey,
      iv: orgBot.symmetricKeyIV,
      tag: orgBot.symmetricKeyTag,
      keyEncoding: orgBot.symmetricKeyKeyEncoding as SecretKeyEncoding
    });

    const {
      ciphertext: encryptedEntryPoint,
      iv: entryPointIV,
      tag: entryPointTag
    } = encryptSymmetric(entryPoint, key);
    const {
      ciphertext: encryptedIssuer,
      iv: issuerIV,
      tag: issuerTag
    } = encryptSymmetric(issuer, key);

    const { ciphertext: encryptedCert, iv: certIV, tag: certTag } = encryptSymmetric(cert, key);
    const samlConfig = await samlConfigDal.create({
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
    cert,
    actorId,
    issuer,
    isActive,
    entryPoint,
    authProvider
  }: TUpdateSamlCfgDTO) => {
    const { permission } = await permissionService.getOrgPermission(actor, actorId, orgId);
    ForbiddenError.from(permission).throwUnlessCan(
      OrgPermissionActions.Edit,
      OrgPermissionSubjects.Sso
    );
    const plan = await licenseService.getPlan(orgId);
    if (!plan.samlSSO)
      throw new BadRequestError({
        message:
          "Failed to update SAML SSO configuration due to plan restriction. Upgrade plan to update SSO configuration."
      });

    const updateQuery: TSamlConfigsUpdate = { authProvider, isActive };
    const orgBot = await orgBotDal.findOne({ orgId });
    if (!orgBot)
      throw new BadRequestError({ message: "Org bot not found", name: "OrgBotNotFound" });
    const key = infisicalSymmetricDecrypt({
      ciphertext: orgBot.encryptedSymmetricKey,
      iv: orgBot.symmetricKeyIV,
      tag: orgBot.symmetricKeyTag,
      keyEncoding: orgBot.symmetricKeyKeyEncoding as SecretKeyEncoding
    });

    if (entryPoint) {
      const {
        ciphertext: encryptedEntryPoint,
        iv: entryPointIV,
        tag: entryPointTag
      } = encryptSymmetric(entryPoint, key);
      updateQuery.encryptedEntryPoint = encryptedEntryPoint;
      updateQuery.entryPointIV = entryPointIV;
      updateQuery.entryPointTag = entryPointTag;
    }
    if (issuer) {
      const {
        ciphertext: encryptedIssuer,
        iv: issuerIV,
        tag: issuerTag
      } = encryptSymmetric(issuer, key);
      updateQuery.encryptedIssuer = encryptedIssuer;
      updateQuery.issuerIV = issuerIV;
      updateQuery.issuerTag = issuerTag;
    }
    if (cert) {
      const { ciphertext: encryptedCert, iv: certIV, tag: certTag } = encryptSymmetric(cert, key);
      updateQuery.encryptedCert = encryptedCert;
      updateQuery.certIV = certIV;
      updateQuery.certTag = certTag;
    }
    const [ssoConfig] = await samlConfigDal.update({ orgId }, updateQuery);
    return ssoConfig;
  };

  const getSaml = async (dto: TGetSamlCfgDTO) => {
    let ssoConfig: TSamlConfigs | undefined;
    if (dto.type === "org") {
      ssoConfig = await samlConfigDal.findOne({ orgId: dto.orgId });
      if (!ssoConfig) return;
    } else if (dto.type === "ssoId") {
      ssoConfig = await samlConfigDal.findById(dto.id);
    }
    if (!ssoConfig) throw new BadRequestError({ message: "Failed to find organization SSO data" });

    // when dto is type id means it's internally used
    if (dto.type === "org") {
      const { permission } = await permissionService.getOrgPermission(
        dto.actor,
        dto.actorId,
        ssoConfig!.orgId
      );
      ForbiddenError.from(permission).throwUnlessCan(
        OrgPermissionActions.Read,
        OrgPermissionSubjects.Sso
      );
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

    const orgBot = await orgBotDal.findOne({ orgId: ssoConfig.orgId });
    if (!orgBot)
      throw new BadRequestError({ message: "Org bot not found", name: "OrgBotNotFound" });
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
      cert
    };
  };

  const samlLogin = async ({
    firstName,
    email,
    lastName,
    authProvider,
    orgId,
    relayState,
    isSignupAllowed
  }: TSamlLoginDTO) => {
    const appCfg = getConfig();
    let user = await userDal.findUserByEmail(email);
    const isSamlSignUpDisabled = !isSignupAllowed && !user;
    if (isSamlSignUpDisabled)
      throw new BadRequestError({ message: "User signup disabled", name: "Saml SSO login" });

    const organization = await orgDal.findOrgById(orgId);
    if (!organization) throw new BadRequestError({ message: "Org not found" });

    if (user) {
      const hasSamlEnabled = (user.authMethods || []).some((method) =>
        Object.values(SamlProviders).includes(method as SamlProviders)
      );
      await userDal.transaction(async (tx) => {
        if (!hasSamlEnabled) {
          await userDal.updateById(user.id, { authMethods: [authProvider] }, tx);
        }
        const [orgMembership] = await orgDal.findMembership({ userId: user.id, orgId }, { tx });
        if (!orgMembership) {
          await orgDal.createMembership(
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
          await orgDal.updateMembershipById(
            orgMembership.id,
            {
              status: OrgMembershipStatus.Accepted
            },
            tx
          );
        }
      });
    } else {
      user = await userDal.transaction(async (tx) => {
        const newUser = await userDal.create(
          {
            email,
            firstName,
            lastName,
            authMethods: [authProvider]
          },
          tx
        );
        await orgDal.createMembership({
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
        email: user.email,
        firstName,
        lastName,
        organizationName: organization.name,
        organizationId: organization.id,
        authMethod: authProvider,
        isUserCompleted,
        ...(relayState
          ? {
              callbackPort: JSON.parse(relayState).callbackPort as string
            }
          : {})
      },
      appCfg.JWT_AUTH_SECRET,
      {
        expiresIn: appCfg.JWT_PROVIDER_AUTH_LIFETIME
      }
    );
    return { isUserCompleted, providerAuthToken };
  };

  return {
    createSamlCfg,
    updateSamlCfg,
    getSaml,
    samlLogin
  };
};
