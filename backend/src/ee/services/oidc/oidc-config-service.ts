/* eslint-disable @typescript-eslint/no-unsafe-call */
import { ForbiddenError } from "@casl/ability";
import { Issuer, Issuer as OpenIdIssuer, Strategy as OpenIdStrategy, TokenSet } from "openid-client";

import { OrgMembershipStatus, TableName, TUsers } from "@app/db/schemas";
import { TOidcConfigsUpdate } from "@app/db/schemas/oidc-configs";
import { EventType, TAuditLogServiceFactory } from "@app/ee/services/audit-log/audit-log-types";
import { TGroupDALFactory } from "@app/ee/services/group/group-dal";
import { addUsersToGroupByUserIds, removeUsersFromGroupByUserIds } from "@app/ee/services/group/group-fns";
import { TUserGroupMembershipDALFactory } from "@app/ee/services/group/user-group-membership-dal";
import { TLicenseServiceFactory } from "@app/ee/services/license/license-service";
import { OrgPermissionActions, OrgPermissionSubjects } from "@app/ee/services/permission/org-permission";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import { getConfig } from "@app/lib/config/env";
import { crypto } from "@app/lib/crypto";
import { BadRequestError, ForbiddenRequestError, NotFoundError, OidcAuthError } from "@app/lib/errors";
import { OrgServiceActor } from "@app/lib/types";
import { ActorType, AuthMethod, AuthTokenType } from "@app/services/auth/auth-type";
import { TAuthTokenServiceFactory } from "@app/services/auth-token/auth-token-service";
import { TokenType } from "@app/services/auth-token/auth-token-types";
import { TGroupProjectDALFactory } from "@app/services/group-project/group-project-dal";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { KmsDataKey } from "@app/services/kms/kms-types";
import { TOrgDALFactory } from "@app/services/org/org-dal";
import { getDefaultOrgMembershipRole } from "@app/services/org/org-role-fns";
import { TOrgMembershipDALFactory } from "@app/services/org-membership/org-membership-dal";
import { TProjectDALFactory } from "@app/services/project/project-dal";
import { TProjectBotDALFactory } from "@app/services/project-bot/project-bot-dal";
import { TProjectKeyDALFactory } from "@app/services/project-key/project-key-dal";
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
  orgMembershipDAL: Pick<TOrgMembershipDALFactory, "create">;
  licenseService: Pick<TLicenseServiceFactory, "getPlan" | "updateSubscriptionOrgMemberCount">;
  tokenService: Pick<TAuthTokenServiceFactory, "createTokenForUser">;
  smtpService: Pick<TSmtpService, "sendMail" | "verify">;
  permissionService: Pick<TPermissionServiceFactory, "getOrgPermission" | "getUserOrgPermission">;
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
  groupProjectDAL: Pick<TGroupProjectDALFactory, "find">;
  projectKeyDAL: Pick<TProjectKeyDALFactory, "find" | "findLatestProjectKey" | "insertMany" | "delete">;
  projectDAL: Pick<TProjectDALFactory, "findProjectGhostUser">;
  projectBotDAL: Pick<TProjectBotDALFactory, "findOne">;
  auditLogService: Pick<TAuditLogServiceFactory, "createAuditLog">;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
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
  smtpService,
  oidcConfigDAL,
  userGroupMembershipDAL,
  groupDAL,
  groupProjectDAL,
  projectKeyDAL,
  projectDAL,
  projectBotDAL,
  auditLogService,
  kmsService
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
      const { permission } = await permissionService.getOrgPermission(
        dto.actor,
        dto.actorId,
        dto.organizationId,
        dto.actorAuthMethod,
        dto.actorOrgId
      );
      ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Read, OrgPermissionSubjects.Sso);
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

    const appCfg = getConfig();
    const userAlias = await userAliasDAL.findOne({
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
        const [orgMembership] = await orgDAL.findMembership(
          {
            [`${TableName.OrgMembership}.userId` as "userId"]: foundUser.id,
            [`${TableName.OrgMembership}.orgId` as "id"]: orgId
          },
          { tx }
        );
        if (!orgMembership) {
          const { role, roleId } = await getDefaultOrgMembershipRole(organization.defaultMembershipRole);

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
          // we prioritize getting the most complete user to create the new alias under
          newUser = await userDAL.findOne(
            {
              email,
              isEmailVerified: true
            },
            tx
          );

          if (!newUser) {
            // this fetches user entries created via invites
            newUser = await userDAL.findOne(
              {
                username: email
              },
              tx
            );

            if (newUser && !newUser.isEmailVerified) {
              // we automatically mark it as email-verified because we've configured trust for OIDC emails
              newUser = await userDAL.updateById(newUser.id, {
                isEmailVerified: true
              });
            }
          }
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
          const { role, roleId } = await getDefaultOrgMembershipRole(organization.defaultMembershipRole);

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
          groupProjectDAL,
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
          groupProjectDAL,
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

    const userEnc = await userDAL.findUserEncKeyByUserId(user.id);
    const isUserCompleted = Boolean(user.isAccepted);
    const providerAuthToken = crypto.jwt().sign(
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

    return { isUserCompleted, providerAuthToken };
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

    const { permission } = await permissionService.getOrgPermission(
      actor,
      actorId,
      org.id,
      actorAuthMethod,
      actorOrgId
    );
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Edit, OrgPermissionSubjects.Sso);

    const { encryptor } = await kmsService.createCipherPairWithDataKey({
      type: KmsDataKey.Organization,
      orgId: org.id
    });

    const serverCfg = await getServerCfg();
    if (isActive && !serverCfg.trustOidcEmails) {
      const isSmtpConnected = await smtpService.verify();
      if (!isSmtpConnected) {
        throw new BadRequestError({
          message:
            "Cannot enable OIDC when there are issues with the instance's SMTP configuration. Bypass this by turning on trust for OIDC emails in the server admin console."
        });
      }
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

    const { permission } = await permissionService.getOrgPermission(
      actor,
      actorId,
      org.id,
      actorAuthMethod,
      actorOrgId
    );
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Create, OrgPermissionSubjects.Sso);

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

  const getOrgAuthStrategy = async (orgSlug: string, callbackPort?: string) => {
    const appCfg = getConfig();

    const org = await orgDAL.findOne({
      slug: orgSlug
    });

    if (!org) {
      throw new NotFoundError({
        message: `Organization with slug '${orgSlug}' not found`
      });
    }

    const oidcCfg = await getOidc({
      type: "internal",
      organizationId: org.id
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
        params: supportsPKCE ? { code_challenge_method: "S256" } : undefined
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (_req: any, tokenSet: TokenSet, cb: any) => {
        const claims = tokenSet.claims();
        if (!claims.email) {
          throw new BadRequestError({
            message: "Invalid request. Missing email claim."
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
          groups,
          callbackPort,
          manageGroupMemberships: oidcCfg.manageGroupMemberships
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

  const isOidcManageGroupMembershipsEnabled = async (orgId: string, actor: OrgServiceActor) => {
    await permissionService.getUserOrgPermission(actor.id, orgId, actor.authMethod, actor.orgId);

    const oidcConfig = await oidcConfigDAL.findOne({
      orgId,
      isActive: true
    });

    return Boolean(oidcConfig?.manageGroupMemberships);
  };

  return { oidcLogin, getOrgAuthStrategy, getOidc, updateOidcCfg, createOidcCfg, isOidcManageGroupMembershipsEnabled };
};
