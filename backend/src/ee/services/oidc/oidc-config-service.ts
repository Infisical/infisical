/* eslint-disable @typescript-eslint/no-unsafe-call */
import { ForbiddenError } from "@casl/ability";
import jwt from "jsonwebtoken";
import { Issuer, Issuer as OpenIdIssuer, Strategy as OpenIdStrategy, TokenSet } from "openid-client";

import { OrgMembershipStatus, SecretKeyEncoding, TableName, TUsers } from "@app/db/schemas";
import { TOidcConfigsUpdate } from "@app/db/schemas/oidc-configs";
import { TLicenseServiceFactory } from "@app/ee/services/license/license-service";
import { OrgPermissionActions, OrgPermissionSubjects } from "@app/ee/services/permission/org-permission";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service";
import { getConfig } from "@app/lib/config/env";
import {
  decryptSymmetric,
  encryptSymmetric,
  generateAsymmetricKeyPair,
  generateSymmetricKey,
  infisicalSymmetricDecrypt,
  infisicalSymmetricEncypt
} from "@app/lib/crypto/encryption";
import { BadRequestError, ForbiddenRequestError, NotFoundError } from "@app/lib/errors";
import { AuthMethod, AuthTokenType } from "@app/services/auth/auth-type";
import { TAuthTokenServiceFactory } from "@app/services/auth-token/auth-token-service";
import { TokenType } from "@app/services/auth-token/auth-token-types";
import { TOrgBotDALFactory } from "@app/services/org/org-bot-dal";
import { TOrgDALFactory } from "@app/services/org/org-dal";
import { getDefaultOrgMembershipRoleDto } from "@app/services/org/org-role-fns";
import { TOrgMembershipDALFactory } from "@app/services/org-membership/org-membership-dal";
import { SmtpTemplates, TSmtpService } from "@app/services/smtp/smtp-service";
import { getServerCfg } from "@app/services/super-admin/super-admin-service";
import { LoginMethod } from "@app/services/super-admin/super-admin-types";
import { TUserDALFactory } from "@app/services/user/user-dal";
import { normalizeUsername } from "@app/services/user/user-fns";
import { TUserAliasDALFactory } from "@app/services/user-alias/user-alias-dal";
import { UserAliasType } from "@app/services/user-alias/user-alias-types";

import { TOidcConfigDALFactory } from "./oidc-config-dal";
import {
  OIDCConfigurationType,
  TCreateOidcCfgDTO,
  TGetOidcCfgDTO,
  TOidcLoginDTO,
  TUpdateOidcCfgDTO
} from "./oidc-config-types";

type TOidcConfigServiceFactoryDep = {
  userDAL: Pick<
    TUserDALFactory,
    "create" | "findOne" | "transaction" | "updateById" | "findById" | "findUserEncKeyByUserId"
  >;
  userAliasDAL: Pick<TUserAliasDALFactory, "create" | "findOne">;
  orgDAL: Pick<
    TOrgDALFactory,
    "createMembership" | "updateMembershipById" | "findMembership" | "findOrgById" | "findOne" | "updateById"
  >;
  orgMembershipDAL: Pick<TOrgMembershipDALFactory, "create">;
  orgBotDAL: Pick<TOrgBotDALFactory, "findOne" | "create" | "transaction">;
  licenseService: Pick<TLicenseServiceFactory, "getPlan" | "updateSubscriptionOrgMemberCount">;
  tokenService: Pick<TAuthTokenServiceFactory, "createTokenForUser">;
  smtpService: Pick<TSmtpService, "sendMail">;
  permissionService: Pick<TPermissionServiceFactory, "getOrgPermission">;
  oidcConfigDAL: Pick<TOidcConfigDALFactory, "findOne" | "update" | "create">;
};

export type TOidcConfigServiceFactory = ReturnType<typeof oidcConfigServiceFactory>;

export const oidcConfigServiceFactory = ({
  orgDAL,
  orgMembershipDAL,
  userDAL,
  userAliasDAL,
  licenseService,
  permissionService,
  tokenService,
  orgBotDAL,
  smtpService,
  oidcConfigDAL
}: TOidcConfigServiceFactoryDep) => {
  const getOidc = async (dto: TGetOidcCfgDTO) => {
    const org = await orgDAL.findOne({ slug: dto.orgSlug });
    if (!org) {
      throw new NotFoundError({
        message: "Organization not found",
        name: "OrgNotFound"
      });
    }
    if (dto.type === "external") {
      const { permission } = await permissionService.getOrgPermission(
        dto.actor,
        dto.actorId,
        org.id,
        dto.actorAuthMethod,
        dto.actorOrgId
      );
      ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Read, OrgPermissionSubjects.Sso);
    }

    const oidcCfg = await oidcConfigDAL.findOne({
      orgId: org.id
    });

    if (!oidcCfg) {
      throw new NotFoundError({
        message: "Failed to find organization OIDC configuration"
      });
    }

    // decrypt and return cfg
    const orgBot = await orgBotDAL.findOne({ orgId: oidcCfg.orgId });
    if (!orgBot) {
      throw new NotFoundError({ message: "Organization bot not found", name: "OrgBotNotFound" });
    }

    const key = infisicalSymmetricDecrypt({
      ciphertext: orgBot.encryptedSymmetricKey,
      iv: orgBot.symmetricKeyIV,
      tag: orgBot.symmetricKeyTag,
      keyEncoding: orgBot.symmetricKeyKeyEncoding as SecretKeyEncoding
    });

    const { encryptedClientId, clientIdIV, clientIdTag, encryptedClientSecret, clientSecretIV, clientSecretTag } =
      oidcCfg;

    let clientId = "";
    if (encryptedClientId && clientIdIV && clientIdTag) {
      clientId = decryptSymmetric({
        ciphertext: encryptedClientId,
        key,
        tag: clientIdTag,
        iv: clientIdIV
      });
    }

    let clientSecret = "";
    if (encryptedClientSecret && clientSecretIV && clientSecretTag) {
      clientSecret = decryptSymmetric({
        key,
        tag: clientSecretTag,
        iv: clientSecretIV,
        ciphertext: encryptedClientSecret
      });
    }

    return {
      id: oidcCfg.id,
      issuer: oidcCfg.issuer,
      authorizationEndpoint: oidcCfg.authorizationEndpoint,
      configurationType: oidcCfg.configurationType,
      discoveryURL: oidcCfg.discoveryURL,
      jwksUri: oidcCfg.jwksUri,
      tokenEndpoint: oidcCfg.tokenEndpoint,
      userinfoEndpoint: oidcCfg.userinfoEndpoint,
      orgId: oidcCfg.orgId,
      isActive: oidcCfg.isActive,
      allowedEmailDomains: oidcCfg.allowedEmailDomains,
      clientId,
      clientSecret
    };
  };

  const oidcLogin = async ({ externalId, email, firstName, lastName, orgId, callbackPort }: TOidcLoginDTO) => {
    const serverCfg = await getServerCfg();

    if (serverCfg.enabledLoginMethods && !serverCfg.enabledLoginMethods.includes(LoginMethod.OIDC)) {
      throw new ForbiddenRequestError({
        message: "Login with OIDC is disabled by administrator."
      });
    }

    const appCfg = getConfig();
    const userAlias = await userAliasDAL.findOne({
      externalId,
      orgId,
      aliasType: UserAliasType.OIDC
    });

    const organization = await orgDAL.findOrgById(orgId);
    if (!organization) throw new NotFoundError({ message: "Organization not found" });

    let user: TUsers;
    if (userAlias) {
      user = await userDAL.transaction(async (tx) => {
        const foundUser = await userDAL.findById(userAlias.userId, tx);
        const [orgMembership] = await orgDAL.findMembership(
          {
            [`${TableName.OrgMembership}.userId` as "userId"]: foundUser.id,
            [`${TableName.OrgMembership}.orgId` as "id"]: orgId
          },
          { tx }
        );
        if (!orgMembership) {
          const { role, roleId } = await getDefaultOrgMembershipRoleDto(organization.defaultMembershipRole);

          await orgMembershipDAL.create(
            {
              userId: userAlias.userId,
              inviteEmail: email,
              orgId,
              role,
              roleId,
              status: foundUser.isAccepted ? OrgMembershipStatus.Accepted : OrgMembershipStatus.Invited, // if user is fully completed, then set status to accepted, otherwise set it to invited so we can update it later
              isActive: true
            },
            tx
          );
          // Only update the membership to Accepted if the user account is already completed.
        } else if (orgMembership.status === OrgMembershipStatus.Invited && foundUser.isAccepted) {
          await orgDAL.updateMembershipById(
            orgMembership.id,
            {
              status: OrgMembershipStatus.Accepted
            },
            tx
          );
        }

        return foundUser;
      });
    } else {
      user = await userDAL.transaction(async (tx) => {
        let newUser: TUsers | undefined;

        if (serverCfg.trustOidcEmails) {
          newUser = await userDAL.findOne(
            {
              email,
              isEmailVerified: true
            },
            tx
          );
        }

        if (!newUser) {
          const uniqueUsername = await normalizeUsername(externalId, userDAL);
          newUser = await userDAL.create(
            {
              email,
              firstName,
              isEmailVerified: serverCfg.trustOidcEmails,
              username: serverCfg.trustOidcEmails ? email : uniqueUsername,
              lastName,
              authMethods: [],
              isGhost: false
            },
            tx
          );
        }

        await userAliasDAL.create(
          {
            userId: newUser.id,
            aliasType: UserAliasType.OIDC,
            externalId,
            emails: email ? [email] : [],
            orgId
          },
          tx
        );

        const [orgMembership] = await orgDAL.findMembership(
          {
            [`${TableName.OrgMembership}.userId` as "userId"]: newUser.id,
            [`${TableName.OrgMembership}.orgId` as "id"]: orgId
          },
          { tx }
        );

        if (!orgMembership) {
          const { role, roleId } = await getDefaultOrgMembershipRoleDto(organization.defaultMembershipRole);

          await orgMembershipDAL.create(
            {
              userId: newUser.id,
              inviteEmail: email,
              orgId,
              role,
              roleId,
              status: newUser.isAccepted ? OrgMembershipStatus.Accepted : OrgMembershipStatus.Invited, // if user is fully completed, then set status to accepted, otherwise set it to invited so we can update it later
              isActive: true
            },
            tx
          );
          // Only update the membership to Accepted if the user account is already completed.
        } else if (orgMembership.status === OrgMembershipStatus.Invited && newUser.isAccepted) {
          await orgDAL.updateMembershipById(
            orgMembership.id,
            {
              status: OrgMembershipStatus.Accepted
            },
            tx
          );
        }

        return newUser;
      });
    }

    await licenseService.updateSubscriptionOrgMemberCount(organization.id);

    const userEnc = await userDAL.findUserEncKeyByUserId(user.id);
    const isUserCompleted = Boolean(user.isAccepted);
    const providerAuthToken = jwt.sign(
      {
        authTokenType: AuthTokenType.PROVIDER_TOKEN,
        userId: user.id,
        username: user.username,
        ...(user.email && { email: user.email, isEmailVerified: user.isEmailVerified }),
        firstName,
        lastName,
        organizationName: organization.name,
        organizationId: organization.id,
        organizationSlug: organization.slug,
        hasExchangedPrivateKey: Boolean(userEnc?.serverEncryptedPrivateKey),
        authMethod: AuthMethod.OIDC,
        authType: UserAliasType.OIDC,
        isUserCompleted,
        ...(callbackPort && { callbackPort })
      },
      appCfg.AUTH_SECRET,
      {
        expiresIn: appCfg.JWT_PROVIDER_AUTH_LIFETIME
      }
    );

    await oidcConfigDAL.update({ orgId }, { lastUsed: new Date() });

    if (user.email && !user.isEmailVerified) {
      const token = await tokenService.createTokenForUser({
        type: TokenType.TOKEN_EMAIL_VERIFICATION,
        userId: user.id
      });

      await smtpService.sendMail({
        template: SmtpTemplates.EmailVerification,
        subjectLine: "Infisical confirmation code",
        recipients: [user.email],
        substitutions: {
          code: token
        }
      });
    }

    return { isUserCompleted, providerAuthToken };
  };

  const updateOidcCfg = async ({
    orgSlug,
    allowedEmailDomains,
    configurationType,
    discoveryURL,
    actor,
    actorOrgId,
    actorAuthMethod,
    actorId,
    issuer,
    isActive,
    authorizationEndpoint,
    jwksUri,
    tokenEndpoint,
    userinfoEndpoint,
    clientId,
    clientSecret
  }: TUpdateOidcCfgDTO) => {
    const org = await orgDAL.findOne({
      slug: orgSlug
    });

    if (!org) {
      throw new NotFoundError({
        message: "Organization not found"
      });
    }

    const plan = await licenseService.getPlan(org.id);
    if (!plan.oidcSSO)
      throw new BadRequestError({
        message:
          "Failed to update OIDC SSO configuration due to plan restriction. Upgrade plan to update SSO configuration."
      });

    const { permission } = await permissionService.getOrgPermission(
      actor,
      actorId,
      org.id,
      actorAuthMethod,
      actorOrgId
    );
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Edit, OrgPermissionSubjects.Sso);

    const orgBot = await orgBotDAL.findOne({ orgId: org.id });
    if (!orgBot) throw new NotFoundError({ message: "Organization bot not found", name: "OrgBotNotFound" });
    const key = infisicalSymmetricDecrypt({
      ciphertext: orgBot.encryptedSymmetricKey,
      iv: orgBot.symmetricKeyIV,
      tag: orgBot.symmetricKeyTag,
      keyEncoding: orgBot.symmetricKeyKeyEncoding as SecretKeyEncoding
    });

    const updateQuery: TOidcConfigsUpdate = {
      allowedEmailDomains,
      configurationType,
      discoveryURL,
      issuer,
      authorizationEndpoint,
      tokenEndpoint,
      userinfoEndpoint,
      jwksUri,
      isActive,
      lastUsed: null
    };

    if (clientId !== undefined) {
      const { ciphertext: encryptedClientId, iv: clientIdIV, tag: clientIdTag } = encryptSymmetric(clientId, key);
      updateQuery.encryptedClientId = encryptedClientId;
      updateQuery.clientIdIV = clientIdIV;
      updateQuery.clientIdTag = clientIdTag;
    }

    if (clientSecret !== undefined) {
      const {
        ciphertext: encryptedClientSecret,
        iv: clientSecretIV,
        tag: clientSecretTag
      } = encryptSymmetric(clientSecret, key);

      updateQuery.encryptedClientSecret = encryptedClientSecret;
      updateQuery.clientSecretIV = clientSecretIV;
      updateQuery.clientSecretTag = clientSecretTag;
    }

    const [ssoConfig] = await oidcConfigDAL.update({ orgId: org.id }, updateQuery);
    await orgDAL.updateById(org.id, { authEnforced: false, scimEnabled: false });
    return ssoConfig;
  };

  const createOidcCfg = async ({
    orgSlug,
    allowedEmailDomains,
    configurationType,
    discoveryURL,
    actor,
    actorOrgId,
    actorAuthMethod,
    actorId,
    issuer,
    isActive,
    authorizationEndpoint,
    jwksUri,
    tokenEndpoint,
    userinfoEndpoint,
    clientId,
    clientSecret
  }: TCreateOidcCfgDTO) => {
    const org = await orgDAL.findOne({
      slug: orgSlug
    });
    if (!org) {
      throw new NotFoundError({
        message: "Organization not found"
      });
    }

    const plan = await licenseService.getPlan(org.id);
    if (!plan.oidcSSO)
      throw new BadRequestError({
        message:
          "Failed to create OIDC SSO configuration due to plan restriction. Upgrade plan to update SSO configuration."
      });

    const { permission } = await permissionService.getOrgPermission(
      actor,
      actorId,
      org.id,
      actorAuthMethod,
      actorOrgId
    );
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Create, OrgPermissionSubjects.Sso);

    const orgBot = await orgBotDAL.transaction(async (tx) => {
      const doc = await orgBotDAL.findOne({ orgId: org.id }, tx);
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
          orgId: org.id,
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

    const { ciphertext: encryptedClientId, iv: clientIdIV, tag: clientIdTag } = encryptSymmetric(clientId, key);
    const {
      ciphertext: encryptedClientSecret,
      iv: clientSecretIV,
      tag: clientSecretTag
    } = encryptSymmetric(clientSecret, key);

    const oidcCfg = await oidcConfigDAL.create({
      issuer,
      isActive,
      configurationType,
      discoveryURL,
      authorizationEndpoint,
      allowedEmailDomains,
      jwksUri,
      tokenEndpoint,
      userinfoEndpoint,
      orgId: org.id,
      encryptedClientId,
      clientIdIV,
      clientIdTag,
      encryptedClientSecret,
      clientSecretIV,
      clientSecretTag
    });

    return oidcCfg;
  };

  const getOrgAuthStrategy = async (orgSlug: string, callbackPort?: string) => {
    const appCfg = getConfig();

    const org = await orgDAL.findOne({
      slug: orgSlug
    });

    if (!org) {
      throw new NotFoundError({
        message: "Organization not found."
      });
    }

    const oidcCfg = await getOidc({
      type: "internal",
      orgSlug
    });

    if (!oidcCfg || !oidcCfg.isActive) {
      throw new ForbiddenRequestError({
        message: "Failed to authenticate with OIDC SSO"
      });
    }

    let issuer: Issuer;
    if (oidcCfg.configurationType === OIDCConfigurationType.DISCOVERY_URL) {
      if (!oidcCfg.discoveryURL) {
        throw new BadRequestError({
          message: "OIDC not configured correctly"
        });
      }
      issuer = await Issuer.discover(oidcCfg.discoveryURL);
    } else {
      if (
        !oidcCfg.issuer ||
        !oidcCfg.authorizationEndpoint ||
        !oidcCfg.jwksUri ||
        !oidcCfg.tokenEndpoint ||
        !oidcCfg.userinfoEndpoint
      ) {
        throw new BadRequestError({
          message: "OIDC not configured correctly"
        });
      }
      issuer = new OpenIdIssuer({
        issuer: oidcCfg.issuer,
        authorization_endpoint: oidcCfg.authorizationEndpoint,
        jwks_uri: oidcCfg.jwksUri,
        token_endpoint: oidcCfg.tokenEndpoint,
        userinfo_endpoint: oidcCfg.userinfoEndpoint
      });
    }

    const client = new issuer.Client({
      client_id: oidcCfg.clientId,
      client_secret: oidcCfg.clientSecret,
      redirect_uris: [`${appCfg.SITE_URL}/api/v1/sso/oidc/callback`]
    });

    const strategy = new OpenIdStrategy(
      {
        client,
        passReqToCallback: true
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (_req: any, tokenSet: TokenSet, cb: any) => {
        const claims = tokenSet.claims();
        if (!claims.email || !claims.given_name) {
          throw new BadRequestError({
            message: "Invalid request. Missing email or first name"
          });
        }

        if (oidcCfg.allowedEmailDomains) {
          const allowedDomains = oidcCfg.allowedEmailDomains.split(", ");
          if (!allowedDomains.includes(claims.email.split("@")[1])) {
            throw new ForbiddenRequestError({
              message: "Email not allowed."
            });
          }
        }

        oidcLogin({
          email: claims.email,
          externalId: claims.sub,
          firstName: claims.given_name ?? "",
          lastName: claims.family_name ?? "",
          orgId: org.id,
          callbackPort
        })
          .then(({ isUserCompleted, providerAuthToken }) => {
            cb(null, { isUserCompleted, providerAuthToken });
          })
          .catch((error) => {
            cb(error);
          });
      }
    );

    return strategy;
  };

  return { oidcLogin, getOrgAuthStrategy, getOidc, updateOidcCfg, createOidcCfg };
};
