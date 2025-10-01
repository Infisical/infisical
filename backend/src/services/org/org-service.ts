import { ForbiddenError } from "@casl/ability";
import slugify from "@sindresorhus/slugify";
import { Knex } from "knex";

import {
  ActionProjectType,
  OrgMembershipRole,
  OrgMembershipStatus,
  ProjectMembershipRole,
  ProjectVersion,
  TableName,
  TOidcConfigs,
  TProjectMemberships,
  TProjectUserMembershipRolesInsert,
  TSamlConfigs,
  TUsers
} from "@app/db/schemas";
import { TGroupDALFactory } from "@app/ee/services/group/group-dal";
import { TLdapConfigDALFactory } from "@app/ee/services/ldap-config/ldap-config-dal";
import { TLicenseServiceFactory } from "@app/ee/services/license/license-service";
import { TOidcConfigDALFactory } from "@app/ee/services/oidc/oidc-config-dal";
import {
  OrgPermissionActions,
  OrgPermissionGroupActions,
  OrgPermissionSecretShareAction,
  OrgPermissionSubjects
} from "@app/ee/services/permission/org-permission";
import {
  constructPermissionErrorMessage,
  validatePrivilegeChangeOperation
} from "@app/ee/services/permission/permission-fns";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import { ProjectPermissionMemberActions, ProjectPermissionSub } from "@app/ee/services/permission/project-permission";
import { TProjectUserAdditionalPrivilegeDALFactory } from "@app/ee/services/project-user-additional-privilege/project-user-additional-privilege-dal";
import { TSamlConfigDALFactory } from "@app/ee/services/saml-config/saml-config-dal";
import { getConfig } from "@app/lib/config/env";
import { crypto } from "@app/lib/crypto/cryptography";
import { generateUserSrpKeys } from "@app/lib/crypto/srp";
import { applyJitter } from "@app/lib/dates";
import { delay as delayMs } from "@app/lib/delay";
import {
  BadRequestError,
  ForbiddenRequestError,
  NotFoundError,
  PermissionBoundaryError,
  UnauthorizedError
} from "@app/lib/errors";
import { groupBy } from "@app/lib/fn";
import { logger } from "@app/lib/logger";
import { alphaNumericNanoId } from "@app/lib/nanoid";
import { isDisposableEmail } from "@app/lib/validator";
import { QueueName } from "@app/queue";
import { getDefaultOrgMembershipRoleForUpdateOrg } from "@app/services/org/org-role-fns";
import { TOrgMembershipDALFactory } from "@app/services/org-membership/org-membership-dal";
import { TUserAliasDALFactory } from "@app/services/user-alias/user-alias-dal";

import { TAuthLoginFactory } from "../auth/auth-login-service";
import { ActorAuthMethod, ActorType, AuthMethod, AuthModeJwtTokenPayload, AuthTokenType } from "../auth/auth-type";
import { TAuthTokenServiceFactory } from "../auth-token/auth-token-service";
import { TokenType } from "../auth-token/auth-token-types";
import { TIdentityMetadataDALFactory } from "../identity/identity-metadata-dal";
import { TProjectDALFactory } from "../project/project-dal";
import { TProjectBotServiceFactory } from "../project-bot/project-bot-service";
import { TProjectKeyDALFactory } from "../project-key/project-key-dal";
import { TProjectMembershipDALFactory } from "../project-membership/project-membership-dal";
import { TProjectUserMembershipRoleDALFactory } from "../project-membership/project-user-membership-role-dal";
import { TProjectRoleDALFactory } from "../project-role/project-role-dal";
import { TReminderServiceFactory } from "../reminder/reminder-types";
import { TSecretDALFactory } from "../secret/secret-dal";
import { fnDeleteProjectSecretReminders } from "../secret/secret-fns";
import { TSecretFolderDALFactory } from "../secret-folder/secret-folder-dal";
import { TSecretV2BridgeDALFactory } from "../secret-v2-bridge/secret-v2-bridge-dal";
import { SmtpTemplates, TSmtpService } from "../smtp/smtp-service";
import { TUserDALFactory } from "../user/user-dal";
import { TIncidentContactsDALFactory } from "./incident-contacts-dal";
import { TOrgBotDALFactory } from "./org-bot-dal";
import { TOrgDALFactory } from "./org-dal";
import { deleteOrgMembershipFn, deleteOrgMembershipsFn } from "./org-fns";
import {
  TDeleteOrgMembershipDTO,
  TDeleteOrgMembershipsDTO,
  TFindAllWorkspacesDTO,
  TFindOrgMembersByEmailDTO,
  TGetOrgGroupsDTO,
  TGetOrgMembershipDTO,
  TInviteUserToOrgDTO,
  TListProjectMembershipsByOrgMembershipIdDTO,
  TResendOrgMemberInvitationDTO,
  TUpdateOrgDTO,
  TUpdateOrgMembershipDTO,
  TUpgradePrivilegeSystemDTO,
  TVerifyUserToOrgDTO
} from "./org-types";
import { TRoleDALFactory } from "../role/role-dal";

type TOrgServiceFactoryDep = {
  userAliasDAL: Pick<TUserAliasDALFactory, "delete">;
  secretDAL: Pick<TSecretDALFactory, "find">;
  secretV2BridgeDAL: Pick<TSecretV2BridgeDALFactory, "find">;
  folderDAL: Pick<TSecretFolderDALFactory, "findByProjectId">;
  orgDAL: TOrgDALFactory;
  orgBotDAL: TOrgBotDALFactory;
  roleDAL: TRoleDALFactory;
  userDAL: TUserDALFactory;
  groupDAL: TGroupDALFactory;
  projectDAL: TProjectDALFactory;
  identityMetadataDAL: Pick<TIdentityMetadataDALFactory, "delete" | "insertMany" | "transaction">;
  projectMembershipDAL: Pick<
    TProjectMembershipDALFactory,
    | "findProjectMembershipsByUserId"
    | "delete"
    | "create"
    | "find"
    | "insertMany"
    | "transaction"
    | "findProjectMembershipsByUserIds"
  >;
  projectKeyDAL: Pick<TProjectKeyDALFactory, "find" | "delete" | "insertMany" | "findLatestProjectKey" | "create">;
  orgMembershipDAL: Pick<
    TOrgMembershipDALFactory,
    | "findOrgMembershipById"
    | "findOne"
    | "findById"
    | "findRecentInvitedMemberships"
    | "updateById"
    | "updateLastInvitedAtByIds"
  >;
  incidentContactDAL: TIncidentContactsDALFactory;
  samlConfigDAL: Pick<TSamlConfigDALFactory, "findOne">;
  oidcConfigDAL: Pick<TOidcConfigDALFactory, "findOne">;
  ldapConfigDAL: Pick<TLdapConfigDALFactory, "findOne">;
  smtpService: TSmtpService;
  tokenService: TAuthTokenServiceFactory;
  permissionService: TPermissionServiceFactory;
  licenseService: Pick<
    TLicenseServiceFactory,
    "getPlan" | "updateSubscriptionOrgMemberCount" | "generateOrgCustomerId" | "removeOrgCustomer"
  >;
  projectUserAdditionalPrivilegeDAL: Pick<TProjectUserAdditionalPrivilegeDALFactory, "delete">;
  projectRoleDAL: Pick<TProjectRoleDALFactory, "find">;
  projectUserMembershipRoleDAL: Pick<TProjectUserMembershipRoleDALFactory, "insertMany" | "create">;
  projectBotService: Pick<TProjectBotServiceFactory, "getBotKey">;
  loginService: Pick<TAuthLoginFactory, "generateUserTokens">;
  reminderService: Pick<TReminderServiceFactory, "deleteReminderBySecretId">;
};

export type TOrgServiceFactory = ReturnType<typeof orgServiceFactory>;

export const orgServiceFactory = ({
  userAliasDAL,
  orgDAL,
  secretDAL,
  secretV2BridgeDAL,
  folderDAL,
  userDAL,
  groupDAL,
  roleDAL,
  incidentContactDAL,
  permissionService,
  smtpService,
  projectDAL,
  projectMembershipDAL,
  projectKeyDAL,
  orgMembershipDAL,
  projectUserAdditionalPrivilegeDAL,
  tokenService,
  orgBotDAL,
  licenseService,
  projectRoleDAL,
  samlConfigDAL,
  oidcConfigDAL,
  ldapConfigDAL,
  projectUserMembershipRoleDAL,
  identityMetadataDAL,
  projectBotService,
  loginService,
  reminderService
}: TOrgServiceFactoryDep) => {
  /*
   * Get organization details by the organization id
   * */
  const findOrganizationById = async (
    userId: string,
    orgId: string,
    actorAuthMethod: ActorAuthMethod,
    actorOrgId: string | undefined
  ) => {
    await permissionService.getOrgPermission(ActorType.USER, userId, orgId, actorAuthMethod, actorOrgId);
    const appCfg = getConfig();
    const org = await orgDAL.findOrgById(orgId);
    if (!org) throw new NotFoundError({ message: `Organization with ID '${orgId}' not found` });
    if (!org.userTokenExpiration) {
      return { ...org, userTokenExpiration: appCfg.JWT_REFRESH_LIFETIME };
    }
    return org;
  };
  /*
   * Get all organization a user part of
   * */
  const findAllOrganizationOfUser = async (userId: string) => {
    const orgs = await orgDAL.findAllOrgsByUserId(userId);

    // Filter out orgs where the membership object is an invitation
    return orgs.filter((org) => org.userStatus !== "invited");
  };

  /*
   * Get all organization an identity is part of
   * */
  const findIdentityOrganization = async (identityId: string) => {
    const org = await orgDAL.findIdentityOrganization(identityId);

    return org;
  };
  /*
   * Get all workspace members
   * */
  const findAllOrgMembers = async (
    userId: string,
    orgId: string,
    actorAuthMethod: ActorAuthMethod,
    actorOrgId: string | undefined
  ) => {
    const { permission } = await permissionService.getOrgPermission(
      ActorType.USER,
      userId,
      orgId,
      actorAuthMethod,
      actorOrgId
    );
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Read, OrgPermissionSubjects.Member);

    const members = await orgDAL.findAllOrgMembers(orgId);
    return members;
  };

  const getOrgGroups = async ({ actor, actorId, orgId, actorAuthMethod, actorOrgId }: TGetOrgGroupsDTO) => {
    const { permission } = await permissionService.getOrgPermission(actor, actorId, orgId, actorAuthMethod, actorOrgId);
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionGroupActions.Read, OrgPermissionSubjects.Groups);
    const groups = await groupDAL.findByOrgId(orgId);
    return groups;
  };

  const findOrgMembersByUsername = async ({
    actor,
    actorId,
    actorOrgId,
    actorAuthMethod,
    orgId,
    emails
  }: TFindOrgMembersByEmailDTO) => {
    const { permission } = await permissionService.getOrgPermission(actor, actorId, orgId, actorAuthMethod, actorOrgId);
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Read, OrgPermissionSubjects.Member);

    const members = await orgDAL.findOrgMembersByUsername(orgId, emails);

    return members;
  };

  const findOrgBySlug = async (slug: string) => {
    const org = await orgDAL.findOrgBySlug(slug);
    if (!org) {
      throw new NotFoundError({ message: `Organization with slug '${slug}' not found` });
    }

    return org;
  };

  const findAllWorkspaces = async ({ actor, actorId, orgId }: TFindAllWorkspacesDTO) => {
    if (actor === ActorType.USER) {
      const workspaces = await projectDAL.findUserProjects(actorId, orgId);
      return workspaces;
    }

    if (actor === ActorType.IDENTITY) {
      const workspaces = await projectDAL.findAllProjectsByIdentity(actorId);
      return workspaces;
    }

    throw new BadRequestError({ message: "Invalid actor type" });
  };

  const addGhostUser = async (orgId: string, tx?: Knex) => {
    const email = `sudo-${alphaNumericNanoId(16)}-${orgId}@infisical.com`; // We add a nanoid because the email is unique. And we have to create a new ghost user each time, so we can have access to the private key.

    const password = crypto.randomBytes(128).toString("hex");

    const user = await userDAL.create(
      {
        isGhost: true,
        authMethods: [AuthMethod.EMAIL],
        username: email,
        email,
        isAccepted: true
      },
      tx
    );

    const encKeys = await generateUserSrpKeys(email, password);

    await userDAL.upsertUserEncryptionKey(
      user.id,
      {
        encryptionVersion: 2,
        publicKey: encKeys.publicKey
      },
      tx
    );

    const createMembershipData = {
      orgId,
      userId: user.id,
      role: OrgMembershipRole.Admin,
      status: OrgMembershipStatus.Accepted,
      isActive: true
    };

    await orgDAL.createMembership(createMembershipData, tx);

    return {
      user,
      keys: encKeys
    };
  };

  const upgradePrivilegeSystem = async ({
    actorId,
    actorOrgId,
    actorAuthMethod,
    orgId
  }: TUpgradePrivilegeSystemDTO) => {
    const { hasRole } = await permissionService.getOrgPermission(
      ActorType.USER,
      actorId,
      orgId,
      actorAuthMethod,
      actorOrgId
    );

    if (!hasRole(OrgMembershipRole.Admin)) {
      throw new ForbiddenRequestError({
        message: "Insufficient privileges - only the organization admin can upgrade the privilege system."
      });
    }

    return orgDAL.transaction(async (tx) => {
      const org = await orgDAL.findById(actorOrgId, tx);
      if (org.shouldUseNewPrivilegeSystem) {
        throw new BadRequestError({
          message: "Privilege system already upgraded"
        });
      }

      const user = await userDAL.findById(actorId, tx);
      if (!user) {
        throw new NotFoundError({ message: `User with ID '${actorId}' not found` });
      }

      return orgDAL.updateById(
        actorOrgId,
        {
          shouldUseNewPrivilegeSystem: true,
          privilegeUpgradeInitiatedAt: new Date(),
          privilegeUpgradeInitiatedByUsername: user.username
        },
        tx
      );
    });
  };

  /*
   * Update organization details
   * */
  const updateOrg = async ({
    actor,
    actorId,
    actorOrgId,
    actorAuthMethod,
    orgId,
    data: {
      name,
      slug,
      authEnforced,
      googleSsoAuthEnforced,
      scimEnabled,
      defaultMembershipRoleSlug,
      enforceMfa,
      selectedMfaMethod,
      allowSecretSharingOutsideOrganization,
      bypassOrgAuthEnabled,
      userTokenExpiration,
      secretsProductEnabled,
      pkiProductEnabled,
      kmsProductEnabled,
      sshProductEnabled,
      scannerProductEnabled,
      shareSecretsProductEnabled,
      maxSharedSecretLifetime,
      maxSharedSecretViewLimit
    }
  }: TUpdateOrgDTO) => {
    const appCfg = getConfig();
    const { permission } = await permissionService.getOrgPermission(actor, actorId, orgId, actorAuthMethod, actorOrgId);
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Edit, OrgPermissionSubjects.Settings);

    if (allowSecretSharingOutsideOrganization !== undefined) {
      ForbiddenError.from(permission).throwUnlessCan(
        OrgPermissionSecretShareAction.ManageSettings,
        OrgPermissionSubjects.SecretShare
      );
    }
    const plan = await licenseService.getPlan(orgId);
    const currentOrg = await orgDAL.findOrgById(actorOrgId);

    if (enforceMfa !== undefined) {
      if (!plan.enforceMfa) {
        throw new BadRequestError({
          message: "Failed to enforce user MFA due to plan restriction. Upgrade plan to enforce/un-enforce MFA."
        });
      }

      if (!appCfg.isSmtpConfigured) {
        throw new BadRequestError({
          message: "Failed to enforce user MFA due to missing instance SMTP configuration."
        });
      }
    }

    if (authEnforced !== undefined) {
      if (!plan?.samlSSO && !plan.oidcSSO)
        throw new BadRequestError({
          message: "Failed to enforce/un-enforce SSO due to plan restriction. Upgrade plan to enforce/un-enforce SSO."
        });
      ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Edit, OrgPermissionSubjects.Sso);
    }

    if (scimEnabled !== undefined) {
      if (!plan?.scim)
        throw new BadRequestError({
          message:
            "Failed to enable/disable SCIM provisioning due to plan restriction. Upgrade plan to enable/disable SCIM provisioning."
        });
      ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Edit, OrgPermissionSubjects.Scim);
      if (scimEnabled && !currentOrg.orgAuthMethod) {
        throw new BadRequestError({
          message: "Cannot enable SCIM when neither SAML or OIDC is configured."
        });
      }
    }

    if (googleSsoAuthEnforced !== undefined) {
      if (!plan.enforceGoogleSSO) {
        throw new BadRequestError({
          message: "Failed to enforce Google SSO due to plan restriction. Upgrade plan to enforce Google SSO."
        });
      }
      ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Edit, OrgPermissionSubjects.Sso);
    }

    if (authEnforced && googleSsoAuthEnforced) {
      throw new BadRequestError({
        message: "SAML/OIDC auth enforcement and Google SSO auth enforcement cannot be enabled at the same time."
      });
    }

    let samlCfg: TSamlConfigs | undefined;
    let oidcCfg: TOidcConfigs | undefined;
    if (authEnforced || googleSsoAuthEnforced) {
      samlCfg = await samlConfigDAL.findOne({
        orgId,
        isActive: true
      });
      oidcCfg = await oidcConfigDAL.findOne({
        orgId,
        isActive: true
      });
    }

    if (authEnforced) {
      if (!samlCfg && !oidcCfg)
        throw new NotFoundError({
          message: `SAML or OIDC configuration for organization with ID '${orgId}' not found`
        });

      if (samlCfg && !samlCfg.lastUsed) {
        throw new BadRequestError({
          message:
            "To apply the new SAML auth enforcement, please log in via SAML at least once. This step is required to enforce SAML-based authentication."
        });
      }

      if (oidcCfg && !oidcCfg.lastUsed) {
        throw new BadRequestError({
          message:
            "To apply the new OIDC auth enforcement, please log in via OIDC at least once. This step is required to enforce OIDC-based authentication."
        });
      }
    }

    if (googleSsoAuthEnforced) {
      if (googleSsoAuthEnforced && currentOrg.authEnforced) {
        throw new BadRequestError({
          message: "Google SSO auth enforcement cannot be enabled when SAML/OIDC auth enforcement is enabled."
        });
      }

      if (samlCfg) {
        throw new BadRequestError({
          message:
            "Cannot enable Google OAuth enforcement while SAML SSO is configured. Disable SAML SSO to enforce Google OAuth."
        });
      }

      if (oidcCfg) {
        throw new BadRequestError({
          message:
            "Cannot enable Google OAuth enforcement while OIDC SSO is configured. Disable OIDC SSO to enforce Google OAuth."
        });
      }

      const ldapCfg = await ldapConfigDAL.findOne({
        orgId,
        isActive: true
      });

      if (ldapCfg) {
        throw new BadRequestError({
          message:
            "Cannot enable Google OAuth enforcement while LDAP SSO is configured. Disable LDAP SSO to enforce Google OAuth."
        });
      }

      if (!currentOrg.googleSsoAuthLastUsed) {
        throw new BadRequestError({
          message:
            "Google SSO auth enforcement cannot be enabled because Google SSO has not been used yet. Please log in via Google SSO at least once before enforcing it for your organization."
        });
      }
    }

    let defaultMembershipRole: string | undefined;
    if (defaultMembershipRoleSlug) {
      defaultMembershipRole = await getDefaultOrgMembershipRoleForUpdateOrg({
        membershipRoleSlug: defaultMembershipRoleSlug,
        orgId,
        roleDAL,
        plan
      });
    }

    const org = await orgDAL.updateById(orgId, {
      name,
      slug: slug ? slugify(slug) : undefined,
      authEnforced,
      googleSsoAuthEnforced,
      scimEnabled,
      defaultMembershipRole,
      enforceMfa,
      selectedMfaMethod,
      allowSecretSharingOutsideOrganization,
      bypassOrgAuthEnabled,
      userTokenExpiration,
      secretsProductEnabled,
      pkiProductEnabled,
      kmsProductEnabled,
      sshProductEnabled,
      scannerProductEnabled,
      shareSecretsProductEnabled,
      maxSharedSecretLifetime,
      maxSharedSecretViewLimit
    });
    if (!org) throw new NotFoundError({ message: `Organization with ID '${orgId}' not found` });
    return org;
  };
  /*
   * Create organization
   * */
  const createOrganization = async (
    {
      userId,
      userEmail,
      orgName
    }: {
      userId?: string;
      orgName: string;
      userEmail?: string | null;
    },
    trx?: Knex
  ) => {
    const { privateKey, publicKey } = await crypto.encryption().asymmetric().generateKeyPair();
    const key = crypto.randomBytes(32).toString("base64");
    const {
      ciphertext: encryptedPrivateKey,
      iv: privateKeyIV,
      tag: privateKeyTag,
      encoding: privateKeyKeyEncoding,
      algorithm: privateKeyAlgorithm
    } = crypto.encryption().symmetric().encryptWithRootEncryptionKey(privateKey);
    const {
      ciphertext: encryptedSymmetricKey,
      iv: symmetricKeyIV,
      tag: symmetricKeyTag,
      encoding: symmetricKeyKeyEncoding,
      algorithm: symmetricKeyAlgorithm
    } = crypto.encryption().symmetric().encryptWithRootEncryptionKey(key);

    const customerId = await licenseService.generateOrgCustomerId(orgName, userEmail);

    const createOrg = async (tx: Knex) => {
      // akhilmhdh: for now this is auto created. in future we can input from user and for previous users just modifiy
      const org = await orgDAL.create(
        { name: orgName, customerId, slug: slugify(`${orgName}-${alphaNumericNanoId(4)}`) },
        tx
      );
      if (userId) {
        await orgDAL.createMembership(
          {
            userId,
            orgId: org.id,
            role: OrgMembershipRole.Admin,
            status: OrgMembershipStatus.Accepted,
            isActive: true
          },
          tx
        );
      }
      await orgBotDAL.create(
        {
          name: org.name,
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
      return org;
    };

    const organization = await (trx ? createOrg(trx) : orgDAL.transaction(createOrg));

    await licenseService.updateSubscriptionOrgMemberCount(organization.id);
    return organization;
  };

  /*
   * Delete organization by id
   * */
  const deleteOrganizationById = async ({
    userId,
    authorizationHeader,
    userAgentHeader,
    ipAddress,
    orgId,
    actorAuthMethod,
    actorOrgId
  }: {
    userId: string;
    authorizationHeader?: string;
    userAgentHeader?: string;
    ipAddress: string;
    orgId: string;
    actorAuthMethod: ActorAuthMethod;
    actorOrgId: string | undefined;
  }) => {
    const { hasRole } = await permissionService.getOrgPermission(
      ActorType.USER,
      userId,
      orgId,
      actorAuthMethod,
      actorOrgId
    );
    if (!hasRole(OrgMembershipRole.Admin)) {
      throw new ForbiddenRequestError({
        name: "DeleteOrganizationById",
        message: "Insufficient privileges"
      });
    }

    if (!authorizationHeader) {
      throw new UnauthorizedError({ name: "Authorization header not set on request." });
    }

    if (!userAgentHeader) {
      throw new BadRequestError({ name: "User agent not set on request." });
    }

    const cfg = getConfig();
    const authToken = authorizationHeader.replace("Bearer ", "");

    const decodedToken = crypto.jwt().verify(authToken, cfg.AUTH_SECRET) as AuthModeJwtTokenPayload;
    if (!decodedToken.authMethod) throw new UnauthorizedError({ name: "Auth method not found on existing token" });

    const response = await orgDAL.transaction(async (tx) => {
      const projects = await projectDAL.find({ orgId }, { tx });

      for await (const project of projects) {
        await fnDeleteProjectSecretReminders(project.id, {
          secretDAL,
          secretV2BridgeDAL,
          reminderService,
          projectBotService,
          folderDAL
        });
      }

      const deletedOrg = await orgDAL.deleteById(orgId, tx);

      if (deletedOrg.customerId) {
        await licenseService.removeOrgCustomer(deletedOrg.customerId);
      }

      // Generate new tokens without the organization ID present
      const user = await userDAL.findById(userId, tx);
      const { access: accessToken, refresh: refreshToken } = await loginService.generateUserTokens(
        {
          user,
          authMethod: decodedToken.authMethod,
          ip: ipAddress,
          userAgent: userAgentHeader,
          isMfaVerified: decodedToken.isMfaVerified,
          mfaMethod: decodedToken.mfaMethod
        },
        tx
      );

      return {
        organization: deletedOrg,
        tokens: {
          accessToken,
          refreshToken
        }
      };
    });

    return response;
  };
  /*
   * Org membership management
   * Not another service because it has close ties with how an org works doesn't make sense to seperate them
   * */
  const updateOrgMembership = async ({
    role,
    isActive,
    orgId,
    userId,
    membershipId,
    actorAuthMethod,
    actorOrgId,
    metadata
  }: TUpdateOrgMembershipDTO) => {
    const { permission } = await permissionService.getOrgPermission(
      ActorType.USER,
      userId,
      orgId,
      actorAuthMethod,
      actorOrgId
    );
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Edit, OrgPermissionSubjects.Member);

    const foundMembership = await orgMembershipDAL.findById(membershipId);
    if (!foundMembership)
      throw new NotFoundError({ message: `Organization membership with ID ${membershipId} not found` });
    if (foundMembership.orgId !== orgId)
      throw new UnauthorizedError({ message: "Updated org member doesn't belong to the organization" });
    if (foundMembership.userId === userId)
      throw new UnauthorizedError({ message: "Cannot update own organization membership" });

    const isCustomRole = !Object.values(OrgMembershipRole).includes(role as OrgMembershipRole);
    let userRole = role;
    let userRoleId: string | null = null;
    if (role && isCustomRole) {
      const customRole = await roleDAL.findOne({ slug: role, orgId });
      if (!customRole) throw new BadRequestError({ name: "UpdateMembership", message: "Organization role not found" });

      const plan = await licenseService.getPlan(orgId);
      if (!plan?.rbac)
        throw new BadRequestError({
          message: "Failed to assign custom role due to RBAC restriction. Upgrade plan to assign custom role to member."
        });

      userRole = OrgMembershipRole.Custom;
      userRoleId = customRole.id;
    }
    const membership = await orgDAL.transaction(async (tx) => {
      const [updatedOrgMembership] = await orgDAL.updateMembership(
        { id: membershipId, scopeOrgId: orgId },
        { role: userRole, roleId: userRoleId, isActive }
      );

      if (metadata) {
        await identityMetadataDAL.delete({ userId: updatedOrgMembership.actorUserId, orgId }, tx);
        if (metadata.length) {
          await identityMetadataDAL.insertMany(
            metadata.map(({ key, value }) => ({
              userId: updatedOrgMembership.actorUserId as string,
              orgId,
              key,
              value
            })),
            tx
          );
        }
      }
      return updatedOrgMembership;
    });
    return membership;
  };

  const resendOrgMemberInvitation = async ({
    orgId,
    actorId,
    actor,
    actorAuthMethod,
    actorOrgId,
    membershipId
  }: TResendOrgMemberInvitationDTO) => {
    const appCfg = getConfig();
    const { permission } = await permissionService.getOrgPermission(actor, actorId, orgId, actorAuthMethod, actorOrgId);

    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Create, OrgPermissionSubjects.Member);

    const invitingUser = await userDAL.findOne({ id: actorId });

    const org = await orgDAL.findOrgById(orgId);

    const [inviteeOrgMembership] = await orgDAL.findMembership({
      [`${TableName.OrgMembership}.orgId` as "orgId"]: orgId,
      [`${TableName.OrgMembership}.id` as "id"]: membershipId
    });

    if (inviteeOrgMembership.status !== OrgMembershipStatus.Invited) {
      throw new BadRequestError({
        message: "Organization invitation already accepted"
      });
    }

    const token = await tokenService.createTokenForUser({
      type: TokenType.TOKEN_EMAIL_ORG_INVITATION,
      userId: inviteeOrgMembership.userId,
      orgId
    });

    if (!appCfg.isSmtpConfigured) {
      return {
        signupToken: {
          email: inviteeOrgMembership.email as string,
          link: `${appCfg.SITE_URL}/signupinvite?token=${token}&to=${inviteeOrgMembership.email}&organization_id=${org?.id}`
        }
      };
    }

    await smtpService.sendMail({
      template: SmtpTemplates.OrgInvite,
      subjectLine: "Infisical organization invitation",
      recipients: [inviteeOrgMembership.email as string],
      substitutions: {
        inviterFirstName: invitingUser.firstName,
        inviterUsername: invitingUser.email,
        organizationName: org?.name,
        email: inviteeOrgMembership.email,
        organizationId: org?.id.toString(),
        token,
        callback_url: `${appCfg.SITE_URL}/signupinvite`
      }
    });

    await orgMembershipDAL.updateById(inviteeOrgMembership.id, {
      lastInvitedAt: new Date()
    });

    return { signupToken: undefined };
  };

  /*
   * Invite user to organization
   */
  const inviteUserToOrganization = async ({
    orgId,
    actorId,
    actor,
    inviteeEmails,
    organizationRoleSlug,
    projects: invitedProjects,
    actorAuthMethod,
    actorOrgId
  }: TInviteUserToOrgDTO) => {
    const appCfg = getConfig();

    const { permission } = await permissionService.getOrgPermission(actor, actorId, orgId, actorAuthMethod, actorOrgId);

    const invitingUser = await userDAL.findOne({ id: actorId });

    const org = await orgDAL.findOrgById(orgId);

    const isEmailInvalid = await isDisposableEmail(inviteeEmails);
    if (isEmailInvalid) {
      throw new BadRequestError({
        message: "Disposable emails are not allowed",
        name: "InviteUser"
      });
    }
    const plan = await licenseService.getPlan(orgId);
    const isCustomOrgRole = !Object.values(OrgMembershipRole).includes(organizationRoleSlug as OrgMembershipRole);
    if (isCustomOrgRole) {
      if (!plan?.rbac)
        throw new BadRequestError({
          message: "Failed to assign custom role due to RBAC restriction. Upgrade plan to assign custom role to member."
        });
    }

    const projectsToInvite = invitedProjects?.length
      ? await projectDAL.find({
          orgId,
          $in: {
            id: invitedProjects?.map(({ id }) => id)
          }
        })
      : [];

    if (projectsToInvite.length !== invitedProjects?.length) {
      throw new ForbiddenRequestError({
        message: "Access denied to one or more of the specified projects"
      });
    }

    if (projectsToInvite.some((el) => el.version !== ProjectVersion.V3)) {
      throw new BadRequestError({
        message: "One or more selected projects are not compatible with this operation. Please upgrade your projects."
      });
    }

    const mailsForOrgInvitation: { email: string; userId: string; firstName: string; lastName: string }[] = [];
    const mailsForProjectInvitation: { email: string[]; projectName: string }[] = [];
    const newProjectMemberships: TProjectMemberships[] = [];

    await orgDAL.transaction(async (tx) => {
      const users: Pick<TUsers, "id" | "firstName" | "lastName" | "email" | "username">[] = [];

      for await (const inviteeEmail of inviteeEmails) {
        const usersByUsername = await userDAL.findUserByUsername(inviteeEmail, tx);
        let inviteeUser =
          usersByUsername?.length > 1
            ? usersByUsername.find((el) => el.username === inviteeEmail)
            : usersByUsername?.[0];

        // if the user doesn't exist we create the user with the email
        if (!inviteeUser) {
          // TODO(carlos): will be removed once the function receives usernames instead of emails
          const usersByEmail = await userDAL.findUserByEmail(inviteeEmail, tx);
          if (usersByEmail?.length === 1) {
            [inviteeUser] = usersByEmail;
          } else {
            inviteeUser = await userDAL.create(
              {
                isAccepted: false,
                email: inviteeEmail,
                username: inviteeEmail,
                authMethods: [AuthMethod.EMAIL],
                isGhost: false
              },
              tx
            );
          }
        }

        const inviteeUserId = inviteeUser?.id;
        const existingEncrytionKey = await userDAL.findUserEncKeyByUserId(inviteeUserId, tx);

        // when user is missing the encrytion keys
        // this could happen either if user doesn't exist or user didn't find step 3 of generating the encryption keys of srp
        // So what we do is we generate a random secure password and then encrypt it with a random pub-private key
        // Then when user sign in (as login is not possible as isAccepted is false) we rencrypt the private key with the user password
        if (!inviteeUser || (inviteeUser && !inviteeUser?.isAccepted && !existingEncrytionKey)) {
          await userDAL.createUserEncryption(
            {
              userId: inviteeUserId,
              encryptionVersion: 2
            },
            tx
          );
        }

        const [inviteeOrgMembership] = await orgDAL.findMembership(
          {
            [`${TableName.OrgMembership}.orgId` as "orgId"]: orgId,
            [`${TableName.OrgMembership}.userId` as "userId"]: inviteeUserId
          },
          { tx }
        );

        // if there exist no org membership we set is as given by the request
        if (!inviteeOrgMembership) {
          if (plan?.slug !== "enterprise" && plan?.identityLimit && plan.identitiesUsed >= plan.identityLimit) {
            // limit imposed on number of identities allowed / number of identities used exceeds the number of identities allowed
            throw new BadRequestError({
              name: "InviteUser",
              message: "Failed to invite member due to member limit reached. Upgrade plan to invite more members."
            });
          }

          if (org?.authEnforced) {
            throw new ForbiddenRequestError({
              name: "InviteUser",
              message: "Failed to invite user due to org-level auth enforced for organization"
            });
          }

          // as its used by project invite also
          ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Create, OrgPermissionSubjects.Member);
          let roleId;
          const orgRole = isCustomOrgRole ? OrgMembershipRole.Custom : organizationRoleSlug;
          if (isCustomOrgRole) {
            const customRole = await orgRoleDAL.findOne({ slug: organizationRoleSlug, orgId });
            if (!customRole) {
              throw new NotFoundError({
                name: "InviteUser",
                message: `Custom organization role with slug '${orgRole}' not found`
              });
            }
            roleId = customRole.id;
          }

          await orgDAL.createMembership(
            {
              userId: inviteeUser.id,
              inviteEmail: inviteeEmail,
              orgId,
              role: orgRole,
              status: OrgMembershipStatus.Invited,
              isActive: true,
              roleId
            },
            tx
          );
          mailsForOrgInvitation.push({
            email: inviteeEmail,
            userId: inviteeUser.id,
            firstName: inviteeUser?.firstName || "",
            lastName: inviteeUser.lastName || ""
          });
        }

        users.push(inviteeUser);
      }

      const userIds = users.map(({ id }) => id);
      const userEncryptionKeys = await userDAL.findUserEncKeyByUserIdsBatch({ userIds }, tx);
      // we don't need to spam with email. Thus org invitation doesn't need project invitation again
      const userIdsWithOrgInvitation = new Set(mailsForOrgInvitation.map((el) => el.userId));

      // if there exist no project membership we set is as given by the request
      for await (const project of projectsToInvite) {
        const projectId = project.id;
        const { permission: projectPermission, membership } = await permissionService.getProjectPermission({
          actor,
          actorId,
          projectId,
          actorAuthMethod,
          actorOrgId,
          actionProjectType: ActionProjectType.Any
        });
        ForbiddenError.from(projectPermission).throwUnlessCan(
          ProjectPermissionMemberActions.Create,
          ProjectPermissionSub.Member
        );
        const existingMembers = await projectMembershipDAL.find(
          {
            projectId: project.id,
            $in: { userId: userIds }
          },
          { tx }
        );
        const existingMembersGroupByUserId = groupBy(existingMembers, (i) => i.userId);
        const userWithEncryptionKeyInvitedToProject = userEncryptionKeys.filter(
          (user) => !existingMembersGroupByUserId?.[user.userId]
        );

        // eslint-disable-next-line no-continue
        if (!userWithEncryptionKeyInvitedToProject.length) continue;

        // validate custom project role
        const invitedProjectRoles = invitedProjects.find((el) => el.id === project.id)?.projectRoleSlug || [
          ProjectMembershipRole.Member
        ];

        for await (const invitedRole of invitedProjectRoles) {
          const { permission: rolePermission } = await permissionService.getProjectPermissionByRole(
            invitedRole,
            projectId
          );

          if (invitedRole !== ProjectMembershipRole.NoAccess) {
            const permissionBoundary = validatePrivilegeChangeOperation(
              membership.shouldUseNewPrivilegeSystem,
              ProjectPermissionMemberActions.GrantPrivileges,
              ProjectPermissionSub.Member,
              projectPermission,
              rolePermission
            );

            if (!permissionBoundary.isValid)
              throw new PermissionBoundaryError({
                message: constructPermissionErrorMessage(
                  "Failed to invite user to the project",
                  membership.shouldUseNewPrivilegeSystem,
                  ProjectPermissionMemberActions.GrantPrivileges,
                  ProjectPermissionSub.Member
                ),
                details: { missingPermissions: permissionBoundary.missingPermissions }
              });
          }
        }

        const customProjectRoles = invitedProjectRoles.filter(
          (role) => !Object.values(ProjectMembershipRole).includes(role as ProjectMembershipRole)
        );
        const hasCustomRole = Boolean(customProjectRoles.length);
        if (hasCustomRole) {
          if (!plan?.rbac)
            throw new BadRequestError({
              name: "InviteUser",
              message:
                "Failed to assign custom role due to RBAC restriction. Upgrade plan to assign custom role to member."
            });
        }

        const customRoles = hasCustomRole
          ? await projectRoleDAL.find({
              projectId,
              $in: { slug: customProjectRoles.map((role) => role) }
            })
          : [];
        if (customRoles.length !== customProjectRoles.length) {
          throw new NotFoundError({ name: "InviteUser", message: "Custom project role not found" });
        }

        const customRolesGroupBySlug = groupBy(customRoles, ({ slug }) => slug);

        const projectMemberships = await projectMembershipDAL.insertMany(
          userWithEncryptionKeyInvitedToProject.map((userEnc) => ({
            projectId,
            userId: userEnc.userId
          })),
          tx
        );
        newProjectMemberships.push(...projectMemberships);

        const sanitizedProjectMembershipRoles: TProjectUserMembershipRolesInsert[] = [];
        invitedProjectRoles.forEach((projectRole) => {
          const isCustomRole = Boolean(customRolesGroupBySlug?.[projectRole]?.[0]);
          projectMemberships.forEach((membershipEntry) => {
            sanitizedProjectMembershipRoles.push({
              projectMembershipId: membershipEntry.id,
              role: isCustomRole ? ProjectMembershipRole.Custom : projectRole,
              customRoleId: customRolesGroupBySlug[projectRole] ? customRolesGroupBySlug[projectRole][0].id : null
            });
          });
        });
        await projectUserMembershipRoleDAL.insertMany(sanitizedProjectMembershipRoles, tx);

        mailsForProjectInvitation.push({
          email: userWithEncryptionKeyInvitedToProject
            .filter((el) => !userIdsWithOrgInvitation.has(el.userId))
            .map((el) => el.email || el.username),
          projectName: project.name
        });
      }
      return users;
    });

    await licenseService.updateSubscriptionOrgMemberCount(orgId);
    const signupTokens: { email: string; link: string }[] = [];
    // send org invite mail
    await Promise.allSettled(
      mailsForOrgInvitation.map(async (el) => {
        const token = await tokenService.createTokenForUser({
          type: TokenType.TOKEN_EMAIL_ORG_INVITATION,
          userId: el.userId,
          orgId
        });

        signupTokens.push({
          email: el.email,
          link: `${appCfg.SITE_URL}/signupinvite?token=${token}&to=${el.email}&organization_id=${org?.id}`
        });

        return smtpService.sendMail({
          template: SmtpTemplates.OrgInvite,
          subjectLine: "Infisical organization invitation",
          recipients: [el.email],
          substitutions: {
            inviterFirstName: invitingUser?.firstName,
            inviterUsername: invitingUser?.email,
            organizationName: org?.name,
            email: el.email,
            organizationId: org?.id.toString(),
            token,
            callback_url: `${appCfg.SITE_URL}/signupinvite`
          }
        });
      })
    );

    await Promise.allSettled(
      mailsForProjectInvitation
        .filter((el) => Boolean(el.email.length))
        .map(async (el) => {
          return smtpService.sendMail({
            template: SmtpTemplates.WorkspaceInvite,
            subjectLine: "Infisical project invitation",
            recipients: el.email,
            substitutions: {
              workspaceName: el.projectName,
              callback_url: `${appCfg.SITE_URL}/login`
            }
          });
        })
    );

    if (!appCfg.isSmtpConfigured) {
      return { signupTokens, projectMemberships: newProjectMemberships };
    }

    return { signupTokens: undefined, projectMemberships: newProjectMemberships };
  };

  /**
   * Organization invitation step 2: Verify that code [code] was sent to email [email] as part of
   * magic link and issue a temporary signup token for user to complete setting up their account
   */
  const verifyUserToOrg = async ({ orgId, email, code }: TVerifyUserToOrgDTO) => {
    const usersByUsername = await userDAL.findUserByUsername(email);
    const user =
      usersByUsername?.length > 1 ? usersByUsername.find((el) => el.username === email) : usersByUsername?.[0];
    if (!user) {
      throw new NotFoundError({ message: "User not found" });
    }

    const [orgMembership] = await orgDAL.findMembership({
      [`${TableName.OrgMembership}.userId` as "userId"]: user.id,
      status: OrgMembershipStatus.Invited,
      [`${TableName.OrgMembership}.orgId` as "orgId"]: orgId
    });

    if (!orgMembership)
      throw new NotFoundError({
        message: "No pending invitation found"
      });

    const organization = await orgDAL.findById(orgId);

    await tokenService.validateTokenForUser({
      type: TokenType.TOKEN_EMAIL_ORG_INVITATION,
      userId: user.id,
      orgId: orgMembership.orgId,
      code
    });

    await userDAL.updateById(user.id, {
      isEmailVerified: true
    });

    if (user.isAccepted) {
      // this means user has already completed signup process
      // isAccepted is set true when keys are exchanged
      await orgDAL.updateMembershipById(orgMembership.id, {
        orgId,
        status: OrgMembershipStatus.Accepted
      });
      await licenseService.updateSubscriptionOrgMemberCount(orgId);
      return { user };
    }

    if (
      organization.authEnforced &&
      !(organization.bypassOrgAuthEnabled && orgMembership.role === OrgMembershipRole.Admin)
    ) {
      return { user };
    }

    const appCfg = getConfig();
    const token = crypto.jwt().sign(
      {
        authTokenType: AuthTokenType.SIGNUP_TOKEN,
        userId: user.id
      },
      appCfg.AUTH_SECRET,
      {
        expiresIn: appCfg.JWT_SIGNUP_LIFETIME
      }
    );

    return { token, user };
  };

  const getOrgMembership = async ({
    membershipId,
    orgId,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId
  }: TGetOrgMembershipDTO) => {
    const { permission } = await permissionService.getOrgPermission(actor, actorId, orgId, actorAuthMethod, actorOrgId);
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Read, OrgPermissionSubjects.Member);

    const membership = await orgMembershipDAL.findOrgMembershipById(membershipId);
    if (!membership) {
      throw new NotFoundError({ message: `Organization membership with ID '${membershipId}' not found` });
    }
    if (membership.orgId !== orgId) {
      throw new ForbiddenRequestError({ message: "Membership does not belong to organization" });
    }

    return membership;
  };

  const deleteOrgMembership = async ({
    orgId,
    userId,
    membershipId,
    actorAuthMethod,
    actorOrgId
  }: TDeleteOrgMembershipDTO) => {
    const { permission } = await permissionService.getUserOrgPermission(userId, orgId, actorAuthMethod, actorOrgId);
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Delete, OrgPermissionSubjects.Member);

    const deletedMembership = await deleteOrgMembershipFn({
      orgMembershipId: membershipId,
      orgId,
      orgDAL,
      projectMembershipDAL,
      projectUserAdditionalPrivilegeDAL,
      projectKeyDAL,
      userAliasDAL,
      licenseService,
      userId
    });

    return deletedMembership;
  };

  const bulkDeleteOrgMemberships = async ({
    orgId,
    userId,
    membershipIds,
    actorAuthMethod,
    actorOrgId
  }: TDeleteOrgMembershipsDTO) => {
    const { permission } = await permissionService.getUserOrgPermission(userId, orgId, actorAuthMethod, actorOrgId);
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Delete, OrgPermissionSubjects.Member);

    if (membershipIds.includes(userId)) {
      throw new BadRequestError({ message: "You cannot delete your own organization membership" });
    }

    const deletedMemberships = await deleteOrgMembershipsFn({
      orgMembershipIds: membershipIds,
      orgId,
      orgDAL,
      projectMembershipDAL,
      projectUserAdditionalPrivilegeDAL,
      projectKeyDAL,
      userAliasDAL,
      licenseService,
      userId
    });

    return deletedMemberships;
  };

  const listProjectMembershipsByOrgMembershipId = async ({
    orgMembershipId,
    orgId,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId
  }: TListProjectMembershipsByOrgMembershipIdDTO) => {
    const { permission } = await permissionService.getOrgPermission(actor, actorId, orgId, actorAuthMethod, actorOrgId);
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Read, OrgPermissionSubjects.Member);

    const membership = await orgMembershipDAL.findOrgMembershipById(orgMembershipId);
    if (!membership) {
      throw new NotFoundError({ message: `Organization membership with ID '${orgMembershipId}' not found` });
    }
    if (membership.orgId !== orgId) throw new NotFoundError({ message: "Failed to find organization membership" });

    const projectMemberships = await projectMembershipDAL.findProjectMembershipsByUserId(orgId, membership.user.id);

    return projectMemberships;
  };

  /*
   * CRUD operations of incident contacts
   * */
  const findIncidentContacts = async (
    userId: string,
    orgId: string,
    actorAuthMethod: ActorAuthMethod,
    actorOrgId: string | undefined
  ) => {
    const { permission } = await permissionService.getUserOrgPermission(userId, orgId, actorAuthMethod, actorOrgId);
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Read, OrgPermissionSubjects.IncidentAccount);
    const incidentContacts = await incidentContactDAL.findByOrgId(orgId);
    return incidentContacts;
  };

  const createIncidentContact = async (
    userId: string,
    orgId: string,
    email: string,
    actorAuthMethod: ActorAuthMethod,
    actorOrgId: string | undefined
  ) => {
    const { permission } = await permissionService.getUserOrgPermission(userId, orgId, actorAuthMethod, actorOrgId);
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Create, OrgPermissionSubjects.IncidentAccount);
    const doesIncidentContactExist = await incidentContactDAL.findOne(orgId, { email });
    if (doesIncidentContactExist) {
      throw new BadRequestError({
        message: "Incident contact already exist",
        name: "Incident contact exist"
      });
    }

    const incidentContact = await incidentContactDAL.create(orgId, email);
    return incidentContact;
  };

  const deleteIncidentContact = async (
    userId: string,
    orgId: string,
    id: string,
    actorAuthMethod: ActorAuthMethod,
    actorOrgId: string | undefined
  ) => {
    const { permission } = await permissionService.getUserOrgPermission(userId, orgId, actorAuthMethod, actorOrgId);
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Delete, OrgPermissionSubjects.IncidentAccount);

    const incidentContact = await incidentContactDAL.deleteById(id, orgId);
    return incidentContact;
  };

  /**
   * Re-send emails to users who haven't accepted an invite yet
   */
  const notifyInvitedUsers = async () => {
    logger.info(`${QueueName.DailyResourceCleanUp}: notify invited users started`);

    const invitedUsers = await orgMembershipDAL.findRecentInvitedMemberships();
    const appCfg = getConfig();

    const orgCache: Record<string, { name: string; id: string } | undefined> = {};
    const notifiedUsers: string[] = [];

    await Promise.all(
      invitedUsers.map(async (invitedUser) => {
        let org = orgCache[invitedUser.orgId];
        if (!org) {
          org = await orgDAL.findById(invitedUser.orgId);
          orgCache[invitedUser.orgId] = org;
        }

        if (!org || !invitedUser.userId) return;

        const token = await tokenService.createTokenForUser({
          type: TokenType.TOKEN_EMAIL_ORG_INVITATION,
          userId: invitedUser.userId,
          orgId: org.id
        });

        if (invitedUser.inviteEmail) {
          await delayMs(Math.max(0, applyJitter(0, 2000)));

          try {
            await smtpService.sendMail({
              template: SmtpTemplates.OrgInvite,
              subjectLine: `Reminder: You have been invited to ${org.name} on Infisical`,
              recipients: [invitedUser.inviteEmail],
              substitutions: {
                organizationName: org.name,
                email: invitedUser.inviteEmail,
                organizationId: org.id.toString(),
                token,
                callback_url: `${appCfg.SITE_URL}/signupinvite`
              }
            });
            notifiedUsers.push(invitedUser.id);
          } catch (err) {
            logger.error(err, `${QueueName.DailyResourceCleanUp}: notify invited users failed to send email`);
          }
        }
      })
    );

    await orgMembershipDAL.updateLastInvitedAtByIds(notifiedUsers);

    logger.info(`${QueueName.DailyResourceCleanUp}: notify invited users completed`);
  };

  return {
    findOrganizationById,
    findAllOrgMembers,
    findAllOrganizationOfUser,
    findIdentityOrganization,
    inviteUserToOrganization,
    verifyUserToOrg,
    updateOrg,
    findOrgMembersByUsername,
    createOrganization,
    deleteOrganizationById,
    getOrgMembership,
    deleteOrgMembership,
    findAllWorkspaces,
    addGhostUser,
    updateOrgMembership,
    // incident contacts
    findIncidentContacts,
    createIncidentContact,
    deleteIncidentContact,
    getOrgGroups,
    listProjectMembershipsByOrgMembershipId,
    findOrgBySlug,
    resendOrgMemberInvitation,
    upgradePrivilegeSystem,
    notifyInvitedUsers,
    bulkDeleteOrgMemberships
  };
};
