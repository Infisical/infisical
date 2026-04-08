/* eslint-disable @typescript-eslint/no-unsafe-call */
import { ForbiddenError } from "@casl/ability";
import { requestContext } from "@fastify/request-context";
import { Issuer, Issuer as OpenIdIssuer, Strategy as OpenIdStrategy, TokenSet } from "openid-client";

import { AccessScope, OrganizationActionScope, OrgMembershipStatus, TableName, TUsers } from "@app/db/schemas";
import { TOidcConfigsUpdate } from "@app/db/schemas/oidc-configs";
import { EventType, TAuditLogServiceFactory } from "@app/ee/services/audit-log/audit-log-types";
import { TGroupDALFactory } from "@app/ee/services/group/group-dal";
import { addUsersToGroupByUserIds, removeUsersFromGroupByUserIds } from "@app/ee/services/group/group-fns";
import { TUserGroupMembershipDALFactory } from "@app/ee/services/group/user-group-membership-dal";
import { throwOnPlanSeatLimitReached } from "@app/ee/services/license/license-fns";
import { TLicenseServiceFactory } from "@app/ee/services/license/license-service";
import { OrgPermissionSsoActions, OrgPermissionSubjects } from "@app/ee/services/permission/org-permission";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import { getConfig } from "@app/lib/config/env";
import { BadRequestError, ForbiddenRequestError, NotFoundError, OidcAuthError } from "@app/lib/errors";
import { AuthAttemptAuthMethod, AuthAttemptAuthResult, authAttemptCounter } from "@app/lib/telemetry/metrics";
import { OrgServiceActor } from "@app/lib/types";
import {
  blockLocalAndPrivateIpAddresses,
  matchesAllowedEmailDomain,
  sanitizeEmail,
  validateEmail
} from "@app/lib/validator";
import { TAuthLoginFactory } from "@app/services/auth/auth-login-service";
import { ActorType, AuthMethod } from "@app/services/auth/auth-type";
import { TAuthTokenServiceFactory } from "@app/services/auth-token/auth-token-service";
import { TokenType } from "@app/services/auth-token/auth-token-types";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { KmsDataKey } from "@app/services/kms/kms-types";
import { TMembershipRoleDALFactory } from "@app/services/membership/membership-role-dal";
import { TMembershipGroupDALFactory } from "@app/services/membership-group/membership-group-dal";
import { TOrgDALFactory } from "@app/services/org/org-dal";
import { getDefaultOrgMembershipRole } from "@app/services/org/org-role-fns";
import { TProjectDALFactory } from "@app/services/project/project-dal";
import { TProjectBotDALFactory } from "@app/services/project-bot/project-bot-dal";
import { TProjectKeyDALFactory } from "@app/services/project-key/project-key-dal";
import { SmtpTemplates, TSmtpService } from "@app/services/smtp/smtp-service";
import { getServerCfg } from "@app/services/super-admin/super-admin-service";
import { LoginMethod } from "@app/services/super-admin/super-admin-types";
import { TUserDALFactory } from "@app/services/user/user-dal";
import { TUserAliasDALFactory } from "@app/services/user-alias/user-alias-dal";
import { UserAliasType } from "@app/services/user-alias/user-alias-types";

import { TEmailDomainDALFactory } from "../email-domain/email-domain-dal";
import { findOrgIdByVerifiedDomain, verifyEmailDomainOwnership } from "../email-domain/email-domain-fns";
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
    | "create"
    | "findOne"
    | "updateById"
    | "findById"
    | "findUserEncKeyByUserId"
    | "findUserEncKeyByUserIdsBatch"
    | "find"
    | "transaction"
  >;
  userAliasDAL: Pick<TUserAliasDALFactory, "create" | "findOne">;
  orgDAL: Pick<
    TOrgDALFactory,
    "createMembership" | "updateMembershipById" | "findMembership" | "findOrgById" | "findOne" | "updateById"
  >;
  membershipGroupDAL: Pick<TMembershipGroupDALFactory, "find">;
  membershipRoleDAL: Pick<TMembershipRoleDALFactory, "create">;
  licenseService: Pick<TLicenseServiceFactory, "getPlan" | "updateSubscriptionOrgMemberCount">;
  tokenService: Pick<TAuthTokenServiceFactory, "createTokenForUser">;
  smtpService: Pick<TSmtpService, "sendMail" | "verify">;
  permissionService: Pick<TPermissionServiceFactory, "getOrgPermission">;
  oidcConfigDAL: Pick<TOidcConfigDALFactory, "findOne" | "update" | "create">;
  groupDAL: Pick<TGroupDALFactory, "findByOrgId">;
  userGroupMembershipDAL: Pick<
    TUserGroupMembershipDALFactory,
    | "find"
    | "transaction"
    | "insertMany"
    | "findGroupMembershipsByUserIdInOrg"
    | "delete"
    | "filterProjectsByUserMembership"
  >;
  projectKeyDAL: Pick<TProjectKeyDALFactory, "find" | "findLatestProjectKey" | "insertMany" | "delete">;
  projectDAL: Pick<TProjectDALFactory, "findProjectGhostUser" | "findById">;
  projectBotDAL: Pick<TProjectBotDALFactory, "findOne">;
  auditLogService: Pick<TAuditLogServiceFactory, "createAuditLog">;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
  loginService: Pick<TAuthLoginFactory, "processProviderCallback">;
  emailDomainDAL: Pick<TEmailDomainDALFactory, "findOne">;
};

export type TOidcConfigServiceFactory = ReturnType<typeof oidcConfigServiceFactory>;

export const oidcConfigServiceFactory = ({
  orgDAL,
  userDAL,
  userAliasDAL,
  licenseService,
  permissionService,
  tokenService,
  smtpService,
  oidcConfigDAL,
  userGroupMembershipDAL,
  groupDAL,
  membershipGroupDAL,
  membershipRoleDAL,
  projectKeyDAL,
  projectDAL,
  projectBotDAL,
  auditLogService,
  kmsService,
  loginService,
  emailDomainDAL
}: TOidcConfigServiceFactoryDep) => {
  const getOidc = async (dto: TGetOidcCfgDTO) => {
    const oidcCfg = await oidcConfigDAL.findOne({
      orgId: dto.organizationId
    });
    if (!oidcCfg) {
      throw new NotFoundError({
        message: `OIDC configuration for organization with ID '${dto.organizationId}' not found`
      });
    }

    if (dto.type === "external") {
      const { permission } = await permissionService.getOrgPermission({
        actorId: dto.actorId,
        actor: dto.actor,
        orgId: dto.organizationId,
        actorOrgId: dto.actorOrgId,
        actorAuthMethod: dto.actorAuthMethod,
        scope: OrganizationActionScope.ParentOrganization
      });
      ForbiddenError.from(permission).throwUnlessCan(OrgPermissionSsoActions.Read, OrgPermissionSubjects.Sso);
    }

    const { decryptor } = await kmsService.createCipherPairWithDataKey({
      type: KmsDataKey.Organization,
      orgId: oidcCfg.orgId
    });

    let clientId = "";
    if (oidcCfg.encryptedOidcClientId) {
      clientId = decryptor({ cipherTextBlob: oidcCfg.encryptedOidcClientId }).toString();
    }

    let clientSecret = "";
    if (oidcCfg.encryptedOidcClientSecret) {
      clientSecret = decryptor({ cipherTextBlob: oidcCfg.encryptedOidcClientSecret }).toString();
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
      clientSecret,
      manageGroupMemberships: oidcCfg.manageGroupMemberships,
      jwtSignatureAlgorithm: oidcCfg.jwtSignatureAlgorithm
    };
  };

  const oidcLogin = async ({
    email,
    externalId,
    firstName,
    lastName,
    orgId,
    ip,
    userAgent,
    callbackPort,
    groups = [],
    manageGroupMemberships
  }: TOidcLoginDTO) => {
    const serverCfg = await getServerCfg();

    if (serverCfg.enabledLoginMethods && !serverCfg.enabledLoginMethods.includes(LoginMethod.OIDC)) {
      throw new ForbiddenRequestError({
        message: "Login with OIDC is disabled by administrator."
      });
    }

    // Verify that the email domain (if verified on the platform) belongs to this org
    await verifyEmailDomainOwnership({ email, orgId, emailDomainDAL });
    const sanitizedEmail = sanitizeEmail(email);
    validateEmail(sanitizedEmail);

    let userAlias = await userAliasDAL.findOne({
      externalId,
      orgId,
      aliasType: UserAliasType.OIDC
    });

    const organization = await orgDAL.findOrgById(orgId);
    if (!organization) throw new NotFoundError({ message: `Organization with ID '${orgId}' not found` });

    let user: TUsers;
    if (userAlias) {
      user = await userDAL.transaction(async (tx) => {
        const foundUser = await userDAL.findById(userAlias.userId, tx);
        // Verify the existing user's stored email domain + cross-org check
        await verifyEmailDomainOwnership({
          email: foundUser.username,
          orgId,
          emailDomainDAL
        });
        const [orgMembership] = await orgDAL.findMembership(
          {
            [`${TableName.Membership}.actorUserId` as "actorUserId"]: userAlias.userId,
            [`${TableName.Membership}.scopeOrgId` as "scopeOrgId"]: orgId,
            [`${TableName.Membership}.scope` as "scope"]: AccessScope.Organization
          },
          { tx }
        );
        if (!orgMembership) {
          const { role, roleId } = await getDefaultOrgMembershipRole(organization.defaultMembershipRole);

          const membership = await orgDAL.createMembership(
            {
              actorUserId: userAlias.userId,
              scopeOrgId: orgId,
              scope: AccessScope.Organization,
              status: OrgMembershipStatus.Invited,
              isActive: true
            },
            tx
          );
          await membershipRoleDAL.create(
            {
              membershipId: membership.id,
              role,
              customRoleId: roleId
            },
            tx
          );
        }

        return foundUser;
      });
    } else {
      user = await userDAL.transaction(async (tx) => {
        let newUser: TUsers | undefined;
        // we prioritize getting the most complete user to create the new alias under
        newUser = await userDAL.findOne(
          {
            username: sanitizedEmail
          },
          tx
        );

        if (!newUser) {
          newUser = await userDAL.create(
            {
              email,
              firstName,
              username: sanitizedEmail,
              lastName,
              authMethods: [],
              isGhost: false
            },
            tx
          );
        }

        userAlias = await userAliasDAL.create(
          {
            userId: newUser.id,
            aliasType: UserAliasType.OIDC,
            externalId,
            emails: sanitizedEmail ? [sanitizedEmail] : [],
            orgId
          },
          tx
        );

        const [orgMembership] = await orgDAL.findMembership(
          {
            [`${TableName.Membership}.actorUserId` as "actorUserId"]: userAlias.userId,
            [`${TableName.Membership}.scopeOrgId` as "scopeOrgId"]: orgId,
            [`${TableName.Membership}.scope` as "scope"]: AccessScope.Organization
          },
          { tx }
        );

        if (!orgMembership) {
          await throwOnPlanSeatLimitReached(licenseService, orgId, UserAliasType.OIDC);

          const { role, roleId } = await getDefaultOrgMembershipRole(organization.defaultMembershipRole);

          const membership = await orgDAL.createMembership(
            {
              actorUserId: newUser.id,
              scopeOrgId: orgId,
              scope: AccessScope.Organization,
              status: OrgMembershipStatus.Invited,
              isActive: true,
              inviteEmail: sanitizedEmail
            },
            tx
          );
          await membershipRoleDAL.create(
            {
              membershipId: membership.id,
              role,
              customRoleId: roleId
            },
            tx
          );
        }

        return newUser;
      });
    }

    if (manageGroupMemberships) {
      const userGroups = await userGroupMembershipDAL.findGroupMembershipsByUserIdInOrg(user.id, orgId);
      const orgGroups = await groupDAL.findByOrgId(orgId);

      const userGroupsNames = userGroups.map((membership) => membership.groupName);
      const missingGroupsMemberships = groups.filter((groupName) => !userGroupsNames.includes(groupName));
      const groupsToAddUserTo = orgGroups.filter((group) => missingGroupsMemberships.includes(group.name));

      for await (const group of groupsToAddUserTo) {
        await addUsersToGroupByUserIds({
          userIds: [user.id],
          group,
          userDAL,
          userGroupMembershipDAL,
          orgDAL,
          membershipGroupDAL,
          projectKeyDAL,
          projectDAL,
          projectBotDAL
        });
      }

      if (groupsToAddUserTo.length) {
        await auditLogService.createAuditLog({
          actor: {
            type: ActorType.PLATFORM,
            metadata: {}
          },
          orgId,
          event: {
            type: EventType.OIDC_GROUP_MEMBERSHIP_MAPPING_ASSIGN_USER,
            metadata: {
              userId: user.id,
              userEmail: user.email ?? user.username,
              assignedToGroups: groupsToAddUserTo.map(({ id, name }) => ({ id, name })),
              userGroupsClaim: groups
            }
          }
        });
      }

      const membershipsToRemove = userGroups
        .filter((membership) => !groups.includes(membership.groupName))
        .map((membership) => membership.groupId);
      const groupsToRemoveUserFrom = orgGroups.filter((group) => membershipsToRemove.includes(group.id));

      for await (const group of groupsToRemoveUserFrom) {
        await removeUsersFromGroupByUserIds({
          userIds: [user.id],
          group,
          userDAL,
          userGroupMembershipDAL,
          membershipGroupDAL,
          projectKeyDAL
        });
      }

      if (groupsToRemoveUserFrom.length) {
        await auditLogService.createAuditLog({
          actor: {
            type: ActorType.PLATFORM,
            metadata: {}
          },
          orgId,
          event: {
            type: EventType.OIDC_GROUP_MEMBERSHIP_MAPPING_REMOVE_USER,
            metadata: {
              userId: user.id,
              userEmail: user.email ?? user.username,
              removedFromGroups: groupsToRemoveUserFrom.map(({ id, name }) => ({ id, name })),
              userGroupsClaim: groups
            }
          }
        });
      }
    }

    await licenseService.updateSubscriptionOrgMemberCount(organization.id);

    await oidcConfigDAL.update({ orgId }, { lastUsed: new Date() });

    if (user.email && !userAlias.isEmailVerified) {
      const token = await tokenService.createTokenForUser({
        type: TokenType.TOKEN_EMAIL_VERIFICATION,
        userId: user.id,
        aliasId: userAlias.id
      });

      await smtpService
        .sendMail({
          template: SmtpTemplates.EmailVerification,
          subjectLine: "Infisical confirmation code",
          recipients: [user.email],
          substitutions: {
            code: token
          }
        })
        .catch((err: Error) => {
          throw new OidcAuthError({
            message: `Error sending email confirmation code for user registration - contact the Infisical instance admin. ${err.message}`
          });
        });
    }

    const callbackResult = await loginService.processProviderCallback({
      user,
      authMethod: AuthMethod.OIDC,
      isEmailVerified: Boolean(userAlias.isEmailVerified),
      aliasId: userAlias.id,
      ip,
      userAgent,
      organizationId: organization.id,
      callbackPort: callbackPort ? Number(callbackPort) : undefined
    });

    return { ...callbackResult, userId: user.id };
  };

  const updateOidcCfg = async ({
    organizationId,
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
    clientSecret,
    manageGroupMemberships,
    jwtSignatureAlgorithm
  }: TUpdateOidcCfgDTO) => {
    const org = await orgDAL.findOne({ id: organizationId });

    if (!org) {
      throw new NotFoundError({
        message: `Organization with ID '${organizationId}' not found`
      });
    }

    const plan = await licenseService.getPlan(org.id);
    if (!plan.oidcSSO)
      throw new BadRequestError({
        message:
          "Failed to update OIDC SSO configuration due to plan restriction. Upgrade plan to update SSO configuration."
      });

    const { permission } = await permissionService.getOrgPermission({
      actorId,
      actor,
      orgId: org.id,
      actorOrgId,
      actorAuthMethod,
      scope: OrganizationActionScope.ParentOrganization
    });
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionSsoActions.Edit, OrgPermissionSubjects.Sso);

    if (org.googleSsoAuthEnforced && isActive) {
      throw new BadRequestError({
        message:
          "You cannot enable OIDC SSO while Google OAuth is enforced. Disable Google OAuth enforcement to enable OIDC SSO."
      });
    }

    const { encryptor } = await kmsService.createCipherPairWithDataKey({
      type: KmsDataKey.Organization,
      orgId: org.id
    });

    if (isActive) {
      const isSmtpConnected = await smtpService.verify();
      if (!isSmtpConnected) {
        throw new BadRequestError({
          message:
            "Cannot enable OIDC when there are issues with the instance's SMTP configuration. Bypass this by turning on trust for OIDC emails in the server admin console."
        });
      }
    }

    if (discoveryURL) {
      await blockLocalAndPrivateIpAddresses(discoveryURL);
    }
    if (jwksUri) {
      await blockLocalAndPrivateIpAddresses(jwksUri);
    }
    if (tokenEndpoint) {
      await blockLocalAndPrivateIpAddresses(tokenEndpoint);
    }
    if (userinfoEndpoint) {
      await blockLocalAndPrivateIpAddresses(userinfoEndpoint);
    }

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
      lastUsed: null,
      manageGroupMemberships,
      jwtSignatureAlgorithm
    };

    if (clientId !== undefined) {
      updateQuery.encryptedOidcClientId = encryptor({ plainText: Buffer.from(clientId) }).cipherTextBlob;
    }

    if (clientSecret !== undefined) {
      updateQuery.encryptedOidcClientSecret = encryptor({ plainText: Buffer.from(clientSecret) }).cipherTextBlob;
    }

    const [ssoConfig] = await oidcConfigDAL.update({ orgId: org.id }, updateQuery);
    await orgDAL.updateById(org.id, { authEnforced: false, scimEnabled: false });
    return ssoConfig;
  };

  const createOidcCfg = async ({
    organizationId,
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
    clientSecret,
    manageGroupMemberships,
    jwtSignatureAlgorithm
  }: TCreateOidcCfgDTO) => {
    const org = await orgDAL.findOne({ id: organizationId });
    if (!org) {
      throw new NotFoundError({
        message: `Organization with ID '${organizationId}' not found`
      });
    }

    const plan = await licenseService.getPlan(org.id);
    if (!plan.oidcSSO)
      throw new BadRequestError({
        message:
          "Failed to create OIDC SSO configuration due to plan restriction. Upgrade plan to update SSO configuration."
      });

    const { permission } = await permissionService.getOrgPermission({
      actorId,
      actor,
      orgId: org.id,
      actorOrgId,
      actorAuthMethod,
      scope: OrganizationActionScope.ParentOrganization
    });
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionSsoActions.Create, OrgPermissionSubjects.Sso);

    if (org.googleSsoAuthEnforced && isActive) {
      throw new BadRequestError({
        message:
          "You cannot enable OIDC SSO while Google OAuth is enforced. Disable Google OAuth enforcement to enable OIDC SSO."
      });
    }

    if (discoveryURL) {
      await blockLocalAndPrivateIpAddresses(discoveryURL);
    }
    if (jwksUri) {
      await blockLocalAndPrivateIpAddresses(jwksUri);
    }
    if (tokenEndpoint) {
      await blockLocalAndPrivateIpAddresses(tokenEndpoint);
    }
    if (userinfoEndpoint) {
      await blockLocalAndPrivateIpAddresses(userinfoEndpoint);
    }

    const { encryptor } = await kmsService.createCipherPairWithDataKey({
      type: KmsDataKey.Organization,
      orgId: org.id
    });

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
      manageGroupMemberships,
      jwtSignatureAlgorithm,
      encryptedOidcClientId: encryptor({ plainText: Buffer.from(clientId) }).cipherTextBlob,
      encryptedOidcClientSecret: encryptor({ plainText: Buffer.from(clientSecret) }).cipherTextBlob
    });

    return oidcCfg;
  };

  const getOrgAuthStrategy = async (
    identifier: string,
    identifierType: "domain" | "orgSlug" = "domain",
    callbackPort?: string
  ) => {
    const appCfg = getConfig();

    let resolvedOrgId: string;

    if (identifierType === "domain") {
      const verifiedDomain = await findOrgIdByVerifiedDomain({ domain: identifier, emailDomainDAL });
      if (!verifiedDomain) {
        throw new ForbiddenRequestError({ message: "Failed to authenticate with OIDC SSO" });
      }
      resolvedOrgId = verifiedDomain.orgId;
    } else {
      const org = await orgDAL.findOne({ slug: identifier, rootOrgId: null });
      if (!org) {
        throw new ForbiddenRequestError({ message: "Failed to authenticate with OIDC SSO" });
      }
      resolvedOrgId = org.id;
    }

    const oidcCfg = await getOidc({
      type: "internal",
      organizationId: resolvedOrgId
    });

    if (!oidcCfg || !oidcCfg.isActive) {
      throw new ForbiddenRequestError({
        message: "Failed to authenticate with OIDC SSO"
      });
    }
    const org = await orgDAL.findOne({ id: resolvedOrgId });

    let issuer: Issuer;
    if (oidcCfg.configurationType === OIDCConfigurationType.DISCOVERY_URL) {
      if (!oidcCfg.discoveryURL) {
        throw new BadRequestError({
          message: "OIDC not configured correctly"
        });
      }
      await blockLocalAndPrivateIpAddresses(oidcCfg.discoveryURL);
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
      await blockLocalAndPrivateIpAddresses(oidcCfg.jwksUri);
      await blockLocalAndPrivateIpAddresses(oidcCfg.tokenEndpoint);
      await blockLocalAndPrivateIpAddresses(oidcCfg.userinfoEndpoint);
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
      redirect_uris: [`${appCfg.SITE_URL}/api/v1/sso/oidc/callback`],
      id_token_signed_response_alg: oidcCfg.jwtSignatureAlgorithm
    });

    // Check if the OIDC provider supports PKCE
    const codeChallengeMethods = client.issuer.metadata.code_challenge_methods_supported;
    const supportsPKCE = Array.isArray(codeChallengeMethods) && codeChallengeMethods.includes("S256");

    const strategy = new OpenIdStrategy(
      {
        client,
        passReqToCallback: true,
        usePKCE: supportsPKCE,
        params: { prompt: "login", ...(supportsPKCE ? { code_challenge_method: "S256" } : {}) }
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (_req: any, tokenSet: TokenSet, cb: any) => {
        const claims = tokenSet.claims();
        if (!claims.email) {
          throw new BadRequestError({
            message: "Invalid request. Missing email claim."
          });
        }

        if (!matchesAllowedEmailDomain(claims.email, oidcCfg.allowedEmailDomains ?? "")) {
          throw new ForbiddenRequestError({
            message: "Email not allowed."
          });
        }

        const name = claims?.given_name || claims?.name;
        if (!name) {
          throw new BadRequestError({
            message: "Invalid request. Missing name claim."
          });
        }

        const groups = typeof claims.groups === "string" ? [claims.groups] : (claims.groups as string[] | undefined);

        oidcLogin({
          email: claims.email.toLowerCase(),
          externalId: claims.sub,
          firstName: name,
          lastName: claims.family_name ?? "",
          orgId: org.id,
          ip: requestContext.get("ip") || "",
          userAgent: requestContext.get("userAgent") || "",
          groups,
          callbackPort,
          manageGroupMemberships: oidcCfg.manageGroupMemberships
        })
          .then((loginResult) => {
            if (appCfg.OTEL_TELEMETRY_COLLECTION_ENABLED) {
              authAttemptCounter.add(1, {
                "infisical.user.email": claims?.email?.toLowerCase(),
                "infisical.user.id": loginResult.userId,
                "infisical.organization.id": org.id,
                "infisical.organization.name": org.name,
                "infisical.auth.method": AuthAttemptAuthMethod.OIDC,
                "infisical.auth.result": AuthAttemptAuthResult.SUCCESS,
                "client.address": requestContext.get("ip"),
                "user_agent.original": requestContext.get("userAgent")
              });
            }

            cb(null, loginResult);
          })
          .catch((error) => {
            if (appCfg.OTEL_TELEMETRY_COLLECTION_ENABLED) {
              authAttemptCounter.add(1, {
                "infisical.user.email": claims?.email?.toLowerCase(),
                "infisical.organization.id": org.id,
                "infisical.organization.name": org.name,
                "infisical.auth.method": AuthAttemptAuthMethod.OIDC,
                "infisical.auth.result": AuthAttemptAuthResult.FAILURE,
                "client.address": requestContext.get("ip"),
                "user_agent.original": requestContext.get("userAgent")
              });
            }

            cb(error);
          });
      }
    );

    return strategy;
  };

  const isOidcManageGroupMembershipsEnabled = async (orgId: string, actor: OrgServiceActor) => {
    await permissionService.getOrgPermission({
      actor: ActorType.USER,
      actorId: actor.id,
      orgId,
      actorAuthMethod: actor.authMethod,
      actorOrgId: actor.orgId,
      scope: OrganizationActionScope.ParentOrganization
    });

    const oidcConfig = await oidcConfigDAL.findOne({
      orgId,
      isActive: true
    });

    return Boolean(oidcConfig?.manageGroupMemberships);
  };

  return { oidcLogin, getOrgAuthStrategy, getOidc, updateOidcCfg, createOidcCfg, isOidcManageGroupMembershipsEnabled };
};
