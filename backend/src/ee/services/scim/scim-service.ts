import { ForbiddenError } from "@casl/ability";
import slugify from "@sindresorhus/slugify";
import { scimPatch } from "scim-patch";

import {
  AccessScope,
  OrganizationActionScope,
  OrgMembershipRole,
  OrgMembershipStatus,
  TableName,
  TGroups,
  TMemberships,
  TUsers
} from "@app/db/schemas";
import { TGroupDALFactory } from "@app/ee/services/group/group-dal";
import { addUsersToGroupByUserIds, removeUsersFromGroupByUserIds } from "@app/ee/services/group/group-fns";
import { TUserGroupMembershipDALFactory } from "@app/ee/services/group/user-group-membership-dal";
import { TScimDALFactory } from "@app/ee/services/scim/scim-dal";
import { getConfig } from "@app/lib/config/env";
import { crypto } from "@app/lib/crypto";
import { BadRequestError, NotFoundError, ScimRequestError, UnauthorizedError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { ms } from "@app/lib/ms";
import { alphaNumericNanoId } from "@app/lib/nanoid";
import { TAdditionalPrivilegeDALFactory } from "@app/services/additional-privilege/additional-privilege-dal";
import { AuthTokenType } from "@app/services/auth/auth-type";
import { TExternalGroupOrgRoleMappingDALFactory } from "@app/services/external-group-org-role-mapping/external-group-org-role-mapping-dal";
import { TMembershipRoleDALFactory } from "@app/services/membership/membership-role-dal";
import { TMembershipGroupDALFactory } from "@app/services/membership-group/membership-group-dal";
import { TMembershipUserDALFactory } from "@app/services/membership-user/membership-user-dal";
import { TOrgDALFactory } from "@app/services/org/org-dal";
import { deleteOrgMembershipsFn } from "@app/services/org/org-fns";
import { getDefaultOrgMembershipRole } from "@app/services/org/org-role-fns";
import { OrgAuthMethod } from "@app/services/org/org-types";
import { TProjectDALFactory } from "@app/services/project/project-dal";
import { TProjectBotDALFactory } from "@app/services/project-bot/project-bot-dal";
import { TProjectKeyDALFactory } from "@app/services/project-key/project-key-dal";
import { SmtpTemplates, TSmtpService } from "@app/services/smtp/smtp-service";
import { getServerCfg } from "@app/services/super-admin/super-admin-service";
import { TUserDALFactory } from "@app/services/user/user-dal";
import { normalizeUsername } from "@app/services/user/user-fns";
import { TUserAliasDALFactory } from "@app/services/user-alias/user-alias-dal";
import { UserAliasType } from "@app/services/user-alias/user-alias-types";

import { TLicenseServiceFactory } from "../license/license-service";
import { OrgPermissionActions, OrgPermissionSubjects } from "../permission/org-permission";
import { TPermissionServiceFactory } from "../permission/permission-service-types";
import { TScimEventsDALFactory } from "./scim-events-dal";
import { buildScimGroup, buildScimGroupList, buildScimUser, buildScimUserList, parseScimFilter } from "./scim-fns";
import { ScimEvent, TScimGroup, TScimServiceFactory } from "./scim-types";

type TScimServiceFactoryDep = {
  scimDAL: Pick<TScimDALFactory, "create" | "find" | "findById" | "deleteById" | "findExpiringTokens" | "update">;
  userDAL: Pick<
    TUserDALFactory,
    "find" | "findOne" | "create" | "transaction" | "findUserEncKeyByUserIdsBatch" | "findById" | "updateById"
  >;
  userAliasDAL: Pick<TUserAliasDALFactory, "findOne" | "create" | "delete" | "update">;
  orgDAL: Pick<
    TOrgDALFactory,
    | "createMembership"
    | "findById"
    | "find"
    | "findMembership"
    | "findMembershipWithScimFilter"
    | "deleteMembershipById"
    | "transaction"
    | "updateMembershipById"
    | "findOrgById"
  >;
  membershipUserDAL: TMembershipUserDALFactory;
  projectDAL: Pick<TProjectDALFactory, "find" | "findProjectGhostUser" | "findById">;
  groupDAL: Pick<
    TGroupDALFactory,
    | "create"
    | "findOne"
    | "findAllGroupPossibleUsers"
    | "delete"
    | "findGroups"
    | "transaction"
    | "updateById"
    | "update"
  >;
  membershipGroupDAL: Pick<TMembershipGroupDALFactory, "find" | "create">;
  membershipRoleDAL: TMembershipRoleDALFactory;
  userGroupMembershipDAL: Pick<
    TUserGroupMembershipDALFactory,
    | "find"
    | "transaction"
    | "insertMany"
    | "filterProjectsByUserMembership"
    | "delete"
    | "findGroupMembershipsByUserIdInOrg"
    | "findGroupMembershipsByGroupIdInOrg"
  >;
  projectKeyDAL: Pick<TProjectKeyDALFactory, "find" | "findLatestProjectKey" | "insertMany" | "delete">;
  projectBotDAL: Pick<TProjectBotDALFactory, "findOne">;
  licenseService: Pick<TLicenseServiceFactory, "getPlan" | "updateSubscriptionOrgMemberCount">;
  permissionService: Pick<TPermissionServiceFactory, "getOrgPermission">;
  smtpService: Pick<TSmtpService, "sendMail">;
  externalGroupOrgRoleMappingDAL: TExternalGroupOrgRoleMappingDALFactory;
  additionalPrivilegeDAL: TAdditionalPrivilegeDALFactory;
  scimEventsDAL: Pick<TScimEventsDALFactory, "create" | "findEventsByOrgId">;
};

export const scimServiceFactory = ({
  licenseService,
  scimDAL,
  userDAL,
  userAliasDAL,
  orgDAL,
  projectDAL,
  groupDAL,
  userGroupMembershipDAL,
  projectKeyDAL,
  projectBotDAL,
  permissionService,
  smtpService,
  externalGroupOrgRoleMappingDAL,
  membershipGroupDAL,
  membershipUserDAL,
  membershipRoleDAL,
  additionalPrivilegeDAL,
  scimEventsDAL
}: TScimServiceFactoryDep): TScimServiceFactory => {
  const createScimToken: TScimServiceFactory["createScimToken"] = async ({
    actor,
    actorId,
    actorOrgId,
    actorAuthMethod,
    orgId,
    description,
    ttlDays
  }) => {
    const { permission } = await permissionService.getOrgPermission({
      scope: OrganizationActionScope.ParentOrganization,
      actor,
      actorId,
      orgId,
      actorAuthMethod,
      actorOrgId
    });
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Create, OrgPermissionSubjects.Scim);

    const plan = await licenseService.getPlan(orgId);
    if (!plan.scim)
      throw new BadRequestError({
        message: "Failed to create a SCIM token due to plan restriction. Upgrade plan to create a SCIM token."
      });

    const appCfg = getConfig();

    const scimTokenData = await scimDAL.create({
      orgId,
      description,
      ttlDays
    });

    const scimToken = crypto.jwt().sign(
      {
        scimTokenId: scimTokenData.id,
        authTokenType: AuthTokenType.SCIM_TOKEN
      },
      appCfg.AUTH_SECRET
    );

    return { scimToken };
  };

  const listScimTokens: TScimServiceFactory["listScimTokens"] = async ({
    actor,
    actorId,
    actorOrgId,
    actorAuthMethod,
    orgId
  }) => {
    const { permission } = await permissionService.getOrgPermission({
      scope: OrganizationActionScope.ParentOrganization,
      actor,
      actorId,
      orgId,
      actorAuthMethod,
      actorOrgId
    });
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Read, OrgPermissionSubjects.Scim);

    const plan = await licenseService.getPlan(orgId);
    if (!plan.scim)
      throw new BadRequestError({
        message: "Failed to get SCIM tokens due to plan restriction. Upgrade plan to get SCIM tokens."
      });

    const scimTokens = await scimDAL.find({ orgId });
    return scimTokens;
  };

  const deleteScimToken: TScimServiceFactory["deleteScimToken"] = async ({
    scimTokenId,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId
  }) => {
    let scimToken = await scimDAL.findById(scimTokenId);
    if (!scimToken) throw new NotFoundError({ message: `SCIM token with ID '${scimTokenId}' not found` });

    const { permission } = await permissionService.getOrgPermission({
      scope: OrganizationActionScope.ParentOrganization,
      actor,
      actorId,
      orgId: scimToken.orgId,
      actorAuthMethod,
      actorOrgId
    });
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Delete, OrgPermissionSubjects.Scim);

    const plan = await licenseService.getPlan(scimToken.orgId);
    if (!plan.scim)
      throw new BadRequestError({
        message: "Failed to delete the SCIM token due to plan restriction. Upgrade plan to delete the SCIM token."
      });

    scimToken = await scimDAL.deleteById(scimTokenId);

    return scimToken;
  };

  const listScimEvents: TScimServiceFactory["listScimEvents"] = async ({
    actor,
    actorId,
    actorOrgId,
    actorAuthMethod,
    orgId,
    since = "1d",
    limit = 30,
    offset = 0
  }) => {
    const { permission } = await permissionService.getOrgPermission({
      scope: OrganizationActionScope.ParentOrganization,
      actor,
      actorId,
      orgId,
      actorAuthMethod,
      actorOrgId
    });
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Read, OrgPermissionSubjects.Scim);

    const plan = await licenseService.getPlan(orgId);
    if (!plan.scim)
      throw new BadRequestError({
        message: "Failed to get SCIM events due to plan restriction. Upgrade plan to get SCIM events."
      });

    // Calculate date to fetch from (default: last 30 days)
    const fromDateTime = Number(new Date()) - ms(since);

    const scimEvents = await scimEventsDAL.findEventsByOrgId(orgId, new Date(fromDateTime), limit, offset);

    return scimEvents;
  };

  // SCIM server endpoints
  const listScimUsers: TScimServiceFactory["listScimUsers"] = async ({
    startIndex = 0,
    limit = 100,
    filter,
    orgId
  }) => {
    const org = await orgDAL.findById(orgId);

    if (!org.scimEnabled)
      throw new ScimRequestError({
        detail: "SCIM is disabled for the organization",
        status: 403
      });

    const findOpts = {
      ...(startIndex && { offset: startIndex - 1 }),
      ...(limit && { limit })
    };

    const users = await orgDAL.findMembershipWithScimFilter(orgId, filter, findOpts);

    const scimUsers = users.map(
      ({ id, externalId, username, firstName, lastName, email, isActive, createdAt, updatedAt }) =>
        buildScimUser({
          orgMembershipId: id ?? "",
          username: externalId ?? username,
          firstName: firstName ?? "",
          lastName: lastName ?? "",
          email,
          active: isActive,
          createdAt,
          updatedAt
        })
    );

    await scimEventsDAL.create({
      orgId,
      eventType: ScimEvent.LIST_USERS,
      event: {
        numberOfUsers: scimUsers.length,
        filter: filter?.slice(0, 500)
      }
    });

    return buildScimUserList({
      scimUsers,
      startIndex,
      limit
    });
  };

  const getScimUser: TScimServiceFactory["getScimUser"] = async ({ orgMembershipId, orgId }) => {
    const [membership] = await orgDAL
      .findMembership({
        [`${TableName.Membership}.id` as "id"]: orgMembershipId,
        [`${TableName.Membership}.scopeOrgId` as "scopeOrgId"]: orgId,
        [`${TableName.Membership}.scope` as "scope"]: AccessScope.Organization
      })
      .catch(() => {
        throw new ScimRequestError({
          detail: "User not found",
          status: 404
        });
      });

    if (!membership)
      throw new ScimRequestError({
        detail: "User not found",
        status: 404
      });

    if (!membership.scimEnabled)
      throw new ScimRequestError({
        detail: "SCIM is disabled for the organization",
        status: 403
      });

    await scimEventsDAL.create({
      orgId,
      eventType: ScimEvent.GET_USER,
      event: {
        username: membership.externalId ?? membership.username,
        email: membership.email ?? "",
        firstName: membership.firstName,
        lastName: membership.lastName,
        active: membership.isActive
      }
    });

    return buildScimUser({
      orgMembershipId: membership.id,
      username: membership.externalId ?? membership.username,
      email: membership.email ?? "",
      firstName: membership.firstName,
      lastName: membership.lastName,
      active: membership.isActive,
      createdAt: membership.createdAt,
      updatedAt: membership.updatedAt
    });
  };

  const createScimUser: TScimServiceFactory["createScimUser"] = async ({
    externalId,
    email,
    firstName,
    lastName,
    orgId
  }) => {
    if (!email) throw new ScimRequestError({ detail: "Invalid request. Missing email.", status: 400 });

    const org = await orgDAL.findOrgById(orgId);
    if (!org)
      throw new ScimRequestError({
        detail: "Organization not found",
        status: 404
      });

    if (!org.scimEnabled)
      throw new ScimRequestError({
        detail: "SCIM is disabled for the organization",
        status: 403
      });

    if (!org.orgAuthMethod) {
      throw new ScimRequestError({
        detail: "Neither SAML or OIDC SSO is configured",
        status: 400
      });
    }

    const appCfg = getConfig();
    const serverCfg = await getServerCfg();

    const aliasType = org.orgAuthMethod === OrgAuthMethod.OIDC ? UserAliasType.OIDC : UserAliasType.SAML;
    const trustScimEmails =
      org.orgAuthMethod === OrgAuthMethod.OIDC ? serverCfg.trustOidcEmails : serverCfg.trustSamlEmails;

    const userAlias = await userAliasDAL.findOne({
      externalId,
      orgId,
      aliasType
    });

    const { user: createdUser, orgMembership: createdOrgMembership } = await userDAL.transaction(async (tx) => {
      let user: TUsers | undefined;
      let orgMembership: TMemberships;
      if (userAlias) {
        user = await userDAL.findById(userAlias.userId, tx);
        orgMembership = await membershipUserDAL.findOne(
          {
            actorUserId: user.id,
            scope: AccessScope.Organization,
            scopeOrgId: orgId
          },
          tx
        );

        if (!orgMembership) {
          const { role, roleId } = await getDefaultOrgMembershipRole(org.defaultMembershipRole);

          orgMembership = await membershipUserDAL.create(
            {
              actorUserId: userAlias.userId,
              inviteEmail: email.toLowerCase(),
              scopeOrgId: orgId,
              scope: AccessScope.Organization,
              status: user.isAccepted ? OrgMembershipStatus.Accepted : OrgMembershipStatus.Invited, // if user is fully completed, then set status to accepted, otherwise set it to invited so we can update it later
              isActive: true
            },
            tx
          );
          await membershipRoleDAL.create(
            {
              membershipId: orgMembership.id,
              role,
              customRoleId: roleId
            },
            tx
          );
        } else if (orgMembership.status === OrgMembershipStatus.Invited && user.isAccepted) {
          orgMembership = await membershipUserDAL.updateById(
            orgMembership.id,
            {
              status: OrgMembershipStatus.Accepted
            },
            tx
          );
        }
      } else {
        // we fetch all users with this email
        const usersWithSameEmail = await userDAL.find(
          {
            email: email.toLowerCase()
          },
          {
            tx
          }
        );

        // if there is a verified email user pick that
        const verifiedEmail = usersWithSameEmail.find((el) => el.isEmailVerified);
        const userWithSameUsername = usersWithSameEmail.find((el) => el.username === email.toLowerCase());
        if (verifiedEmail) {
          user = verifiedEmail;
          // a user who is invited via email not logged in yet
        } else if (userWithSameUsername) {
          user = userWithSameUsername;
        }

        if (!user) {
          const uniqueUsername = await normalizeUsername(
            // external id is username
            `${firstName}-${lastName}`,
            userDAL
          );
          user = await userDAL.create(
            {
              username: trustScimEmails ? email.toLowerCase() : uniqueUsername,
              email: email.toLowerCase(),
              isEmailVerified: trustScimEmails,
              firstName,
              lastName,
              authMethods: [],
              isGhost: false
            },
            tx
          );
        }

        await userAliasDAL.create(
          {
            userId: user.id,
            aliasType,
            externalId,
            emails: email ? [email.toLowerCase()] : [],
            orgId,
            isEmailVerified: trustScimEmails
          },
          tx
        );

        const [foundOrgMembership] = await orgDAL.findMembership(
          {
            [`${TableName.Membership}.actorUserId` as "actorUserId"]: user.id,
            [`${TableName.Membership}.scopeOrgId` as "scopeOrgId"]: orgId,
            [`${TableName.Membership}.scope` as "scope"]: AccessScope.Organization
          },
          { tx }
        );

        orgMembership = foundOrgMembership;

        if (!orgMembership) {
          const { role, roleId } = await getDefaultOrgMembershipRole(org.defaultMembershipRole);

          orgMembership = await membershipUserDAL.create(
            {
              actorUserId: user.id,
              inviteEmail: email.toLowerCase(),
              scopeOrgId: orgId,
              scope: AccessScope.Organization,
              status: user.isAccepted ? OrgMembershipStatus.Accepted : OrgMembershipStatus.Invited, // if user is fully completed, then set status to accepted, otherwise set it to invited so we can update it later
              isActive: true
            },
            tx
          );
          await membershipRoleDAL.create(
            {
              membershipId: orgMembership.id,
              role,
              customRoleId: roleId
            },
            tx
          );
          // Only update the membership to Accepted if the user account is already completed.
        } else if (orgMembership.status === OrgMembershipStatus.Invited && user.isAccepted) {
          orgMembership = await orgDAL.updateMembershipById(
            orgMembership.id,
            {
              status: OrgMembershipStatus.Accepted
            },
            tx
          );
        }
      }
      await scimEventsDAL.create(
        {
          orgId,
          eventType: ScimEvent.CREATE_USER,
          event: {
            username: externalId,
            email: user.email ?? "",
            firstName: user.firstName,
            lastName: user.lastName,
            active: orgMembership.isActive
          }
        },
        tx
      );
      await licenseService.updateSubscriptionOrgMemberCount(org.id);
      return { user, orgMembership };
    });

    if (email) {
      await smtpService.sendMail({
        template: SmtpTemplates.ScimUserProvisioned,
        subjectLine: "Infisical organization invitation",
        recipients: [email],
        substitutions: {
          organizationName: org.name,
          callback_url: `${appCfg.SITE_URL}/api/v1/sso/redirect/organizations/${org.slug}`
        }
      });
    }

    return buildScimUser({
      orgMembershipId: createdOrgMembership.id,
      username: externalId,
      firstName: createdUser.firstName,
      lastName: createdUser.lastName,
      email: createdUser.email ?? "",
      active: createdOrgMembership.isActive,
      createdAt: createdOrgMembership.createdAt,
      updatedAt: createdOrgMembership.updatedAt
    });
  };

  // partial
  const updateScimUser: TScimServiceFactory["updateScimUser"] = async ({ orgMembershipId, orgId, operations }) => {
    const org = await orgDAL.findOrgById(orgId);
    if (!org.orgAuthMethod) {
      throw new ScimRequestError({
        detail: "Neither SAML or OIDC SSO is configured",
        status: 400
      });
    }

    const [membership] = await orgDAL
      .findMembership({
        [`${TableName.Membership}.id` as "id"]: orgMembershipId,
        [`${TableName.Membership}.scopeOrgId` as "scopeOrgId"]: orgId,
        [`${TableName.Membership}.scope` as "scope"]: AccessScope.Organization
      })
      .catch(() => {
        throw new ScimRequestError({
          detail: "User not found",
          status: 404
        });
      });

    if (!membership || !membership.actorUserId)
      throw new ScimRequestError({
        detail: "User not found",
        status: 404
      });

    if (!membership.scimEnabled)
      throw new ScimRequestError({
        detail: "SCIM is disabled for the organization",
        status: 403
      });

    const scimUser = buildScimUser({
      orgMembershipId: membership.id,
      email: membership.email,
      lastName: membership.lastName,
      firstName: membership.firstName,
      active: membership.isActive,
      username: membership.externalId ?? membership.username,
      createdAt: membership.createdAt,
      updatedAt: membership.updatedAt
    });
    scimPatch(scimUser, operations);

    const serverCfg = await getServerCfg();
    const trustScimEmails =
      org.orgAuthMethod === OrgAuthMethod.OIDC ? serverCfg.trustOidcEmails : serverCfg.trustSamlEmails;

    await userDAL.transaction(async (tx) => {
      await membershipUserDAL.updateById(
        membership.id,
        {
          isActive: scimUser.active
        },
        tx
      );
      const hasEmailChanged = scimUser.emails[0].value !== membership.email;
      await userDAL.updateById(
        membership.actorUserId as string,
        {
          firstName: scimUser.name.givenName,
          email: scimUser.emails[0].value.toLowerCase(),
          lastName: scimUser.name.familyName,
          isEmailVerified: hasEmailChanged ? trustScimEmails : undefined
        },
        tx
      );

      await scimEventsDAL.create(
        {
          orgId,
          eventType: ScimEvent.UPDATE_USER,
          event: {
            firstName: scimUser.name.givenName,
            email: scimUser.emails[0].value.toLowerCase(),
            lastName: scimUser.name.familyName,
            active: scimUser.active
          }
        },
        tx
      );
    });

    return scimUser;
  };

  const replaceScimUser: TScimServiceFactory["replaceScimUser"] = async ({
    orgMembershipId,
    active,
    orgId,
    lastName,
    firstName,
    email,
    externalId
  }) => {
    const org = await orgDAL.findOrgById(orgId);
    if (!org.orgAuthMethod) {
      throw new ScimRequestError({
        detail: "Neither SAML or OIDC SSO is configured",
        status: 400
      });
    }

    const [membership] = await orgDAL
      .findMembership({
        [`${TableName.Membership}.id` as "id"]: orgMembershipId,
        [`${TableName.Membership}.scopeOrgId` as "scopeOrgId"]: orgId,
        [`${TableName.Membership}.scope` as "scope"]: AccessScope.Organization
      })
      .catch(() => {
        throw new ScimRequestError({
          detail: "User not found",
          status: 404
        });
      });

    if (!membership || !membership.actorUserId)
      throw new ScimRequestError({
        detail: "User not found",
        status: 404
      });

    if (!membership.scimEnabled)
      throw new ScimRequestError({
        detail: "SCIM is disabled for the organization",
        status: 403
      });

    const serverCfg = await getServerCfg();
    const hasEmailChanged = email?.toLowerCase() !== membership.email;
    const defaultEmailVerified =
      org.orgAuthMethod === OrgAuthMethod.OIDC ? serverCfg.trustOidcEmails : serverCfg.trustSamlEmails;
    await userDAL.transaction(async (tx) => {
      await userAliasDAL.update(
        {
          orgId,
          aliasType: org.orgAuthMethod === OrgAuthMethod.OIDC ? UserAliasType.OIDC : UserAliasType.SAML,
          userId: membership.actorUserId as string
        },
        {
          externalId
        },
        tx
      );

      await membershipUserDAL.updateById(
        membership.id,
        {
          isActive: active
        },
        tx
      );
      await userDAL.updateById(
        membership.actorUserId!,
        {
          firstName,
          email: email?.toLowerCase(),
          lastName,
          isEmailVerified: hasEmailChanged ? defaultEmailVerified : undefined
        },
        tx
      );

      await scimEventsDAL.create(
        {
          orgId,
          eventType: ScimEvent.REPLACE_USER,
          event: {
            username: externalId,
            firstName,
            email: email?.toLowerCase(),
            lastName,
            active
          }
        },
        tx
      );
    });

    return buildScimUser({
      orgMembershipId: membership.id,
      username: externalId,
      email: membership.email,
      firstName: membership.firstName,
      lastName: membership.lastName,
      active,
      createdAt: membership.createdAt,
      updatedAt: membership.updatedAt
    });
  };

  const deleteScimUser: TScimServiceFactory["deleteScimUser"] = async ({ orgMembershipId, orgId }) => {
    const [membership] = await orgDAL.findMembership({
      [`${TableName.Membership}.id` as "id"]: orgMembershipId,
      [`${TableName.Membership}.scopeOrgId` as "scopeOrgId"]: orgId,
      [`${TableName.Membership}.scope` as "scope"]: AccessScope.Organization
    });

    if (!membership)
      throw new ScimRequestError({
        detail: "User not found",
        status: 404
      });

    if (!membership.scimEnabled) {
      throw new ScimRequestError({
        detail: "SCIM is disabled for the organization",
        status: 403
      });
    }

    await deleteOrgMembershipsFn({
      orgMembershipIds: [membership.id],
      orgId: membership.scopeOrgId,
      orgDAL,
      projectKeyDAL,
      userAliasDAL,
      licenseService,
      membershipUserDAL,
      membershipRoleDAL,
      userGroupMembershipDAL,
      additionalPrivilegeDAL
    });

    await scimEventsDAL.create({
      orgId,
      eventType: ScimEvent.DELETE_USER,
      event: {
        firstName: membership.firstName,
        email: membership.email,
        lastName: membership.lastName,
        active: membership.isActive
      }
    });

    return {}; // intentionally return empty object upon success
  };

  const listScimGroups: TScimServiceFactory["listScimGroups"] = async ({
    orgId,
    startIndex,
    limit,
    filter,
    isMembersExcluded
  }) => {
    const plan = await licenseService.getPlan(orgId);
    if (!plan.groups)
      throw new BadRequestError({
        message: "Failed to list SCIM groups due to plan restriction. Upgrade plan to list SCIM groups."
      });

    const org = await orgDAL.findById(orgId);
    if (!org) {
      throw new ScimRequestError({
        detail: "Organization Not Found",
        status: 404
      });
    }

    if (!org.scimEnabled)
      throw new ScimRequestError({
        detail: "SCIM is disabled for the organization",
        status: 403
      });

    const groups = await groupDAL.findGroups(
      {
        orgId,
        ...(filter && parseScimFilter(filter))
      },
      {
        offset: startIndex - 1,
        limit
      }
    );

    const scimGroups: TScimGroup[] = [];
    if (isMembersExcluded) {
      return buildScimGroupList({
        scimGroups: groups.map((group) =>
          buildScimGroup({
            groupId: group.id,
            name: group.name,
            members: [],
            createdAt: group.createdAt,
            updatedAt: group.updatedAt
          })
        ),
        startIndex,
        limit
      });
    }

    for await (const group of groups) {
      const members = await userGroupMembershipDAL.findGroupMembershipsByGroupIdInOrg(group.id, orgId);
      const scimGroup = buildScimGroup({
        groupId: group.id,
        name: group.name,
        members: members.map((member) => ({
          value: member.orgMembershipId,
          display: `${member.firstName ?? ""} ${member.lastName ?? ""}`
        })),
        createdAt: group.createdAt,
        updatedAt: group.updatedAt
      });
      scimGroups.push(scimGroup);
    }

    await scimEventsDAL.create({
      orgId,
      eventType: ScimEvent.LIST_GROUPS,
      event: {
        numberOfGroups: scimGroups.length,
        filter: filter?.slice(0, 500)
      }
    });

    return buildScimGroupList({
      scimGroups,
      startIndex,
      limit
    });
  };

  const $syncNewMembersRoles = async (group: TGroups, members: TScimGroup["members"]) => {
    // this function handles configuring newly provisioned users org membership if an external group mapping exists

    if (!members.length) return;

    const externalGroupMapping = await externalGroupOrgRoleMappingDAL.findOne({
      orgId: group.orgId,
      groupName: group.name
    });

    // no mapping, user will have default org membership
    if (!externalGroupMapping) return;

    // only get org memberships that are new (invites)
    const newOrgMemberships = await membershipUserDAL.find({
      status: "invited",
      scope: AccessScope.Organization,
      $in: {
        id: members.map((member) => member.value)
      }
    });

    if (!newOrgMemberships.length) return;

    // set new membership roles to group mapping value
    await membershipRoleDAL.update(
      {
        $in: {
          membershipId: newOrgMemberships.map((membership) => membership.id)
        }
      },
      {
        role: externalGroupMapping.role,
        customRoleId: externalGroupMapping.roleId
      }
    );
  };

  const createScimGroup: TScimServiceFactory["createScimGroup"] = async ({ displayName, orgId, members }) => {
    const plan = await licenseService.getPlan(orgId);
    if (!plan.groups)
      throw new BadRequestError({
        message: "Failed to create a SCIM group due to plan restriction. Upgrade plan to create a SCIM group."
      });

    const org = await orgDAL.findById(orgId);

    if (!org) {
      throw new ScimRequestError({
        detail: "Organization Not Found",
        status: 404
      });
    }

    if (!org.scimEnabled)
      throw new ScimRequestError({
        detail: "SCIM is disabled for the organization",
        status: 403
      });

    const newGroup = await groupDAL.transaction(async (tx) => {
      const conflictingGroup = await groupDAL.findOne(
        {
          name: displayName,
          orgId
        },
        tx
      );

      if (conflictingGroup) {
        throw new ScimRequestError({
          detail: `Group with name '${displayName}' already exists in the organization`,
          status: 409
        });
      }

      const group = await groupDAL.create(
        {
          name: displayName,
          slug: slugify(`${displayName}-${alphaNumericNanoId(4)}`),
          orgId,
          role: OrgMembershipRole.NoAccess
        },
        tx
      );

      const groupMembership = await membershipGroupDAL.create(
        {
          scope: AccessScope.Organization,
          actorGroupId: group.id,
          scopeOrgId: orgId
        },
        tx
      );

      await membershipRoleDAL.create(
        {
          membershipId: groupMembership.id,
          role: OrgMembershipRole.NoAccess
        },
        tx
      );

      if (members && members.length) {
        const orgMemberships = await membershipUserDAL.find({
          scope: AccessScope.Organization,
          $in: {
            id: members.map((member) => member.value)
          }
        });

        const newMembers = await addUsersToGroupByUserIds({
          group,
          userIds: orgMemberships.map((membership) => membership.actorUserId as string),
          userDAL,
          userGroupMembershipDAL,
          orgDAL,
          projectKeyDAL,
          projectDAL,
          projectBotDAL,
          membershipGroupDAL,
          tx
        });

        await $syncNewMembersRoles(group, members);

        return { group, newMembers };
      }

      return { group, newMembers: [] };
    });

    const orgMemberships = await orgDAL.findMembership({
      [`${TableName.Membership}.scopeOrgId` as "scopeOrgId"]: orgId,
      [`${TableName.Membership}.scope` as "scope"]: AccessScope.Organization,
      $in: {
        [`${TableName.Membership}.actorUserId` as "actorUserId"]: newGroup.newMembers.map((member) => member.id)
      }
    });

    await scimEventsDAL.create({
      orgId,
      eventType: ScimEvent.CREATE_GROUP,
      event: {
        groupName: newGroup.group.name,
        numberOfMembers: orgMemberships.length
      }
    });

    return buildScimGroup({
      groupId: newGroup.group.id,
      name: newGroup.group.name,
      members: orgMemberships.map(({ id, firstName, lastName }) => ({
        value: id,
        display: `${firstName} ${lastName}`
      })),
      createdAt: newGroup.group.createdAt,
      updatedAt: newGroup.group.updatedAt
    });
  };

  const getScimGroup: TScimServiceFactory["getScimGroup"] = async ({ groupId, orgId }) => {
    const plan = await licenseService.getPlan(orgId);
    if (!plan.groups)
      throw new BadRequestError({
        message: "Failed to get SCIM group due to plan restriction. Upgrade plan to get SCIM group."
      });

    const group = await groupDAL.findOne({
      id: groupId,
      orgId
    });

    if (!group) {
      throw new ScimRequestError({
        detail: "Group Not Found",
        status: 404
      });
    }

    const users = await groupDAL
      .findAllGroupPossibleUsers({
        orgId: group.orgId,
        groupId: group.id
      })
      .then((g) => g.members);

    const orgMemberships = await orgDAL.findMembership({
      [`${TableName.Membership}.scopeOrgId` as "scopeOrgId"]: orgId,
      [`${TableName.Membership}.scope` as "scope"]: AccessScope.Organization,
      $in: {
        [`${TableName.Membership}.actorUserId` as "actorUserId"]: users
          .filter((user) => user.isPartOfGroup)
          .map((user) => user.id)
      }
    });

    await scimEventsDAL.create({
      orgId,
      eventType: ScimEvent.GET_GROUP,
      event: {
        groupName: group.name,
        numberOfMembers: orgMemberships.length
      }
    });

    return buildScimGroup({
      groupId: group.id,
      name: group.name,
      members: orgMemberships.map(({ id, firstName, lastName }) => ({
        value: id,
        display: `${firstName} ${lastName}`
      })),
      createdAt: group.createdAt,
      updatedAt: group.updatedAt
    });
  };

  const $replaceGroupDAL = async (
    groupId: string,
    orgId: string,
    { displayName, members = [] }: { displayName: string; members: { value: string }[] }
  ) => {
    let group = await groupDAL.findOne({
      id: groupId,
      orgId
    });

    if (!group) {
      throw new ScimRequestError({
        detail: "Group Not Found",
        status: 404
      });
    }

    const updatedGroup = await groupDAL.transaction(async (tx) => {
      if (group?.name !== displayName) {
        await externalGroupOrgRoleMappingDAL.update(
          {
            groupName: group?.name,
            orgId
          },
          {
            groupName: displayName
          }
        );

        const [modifiedGroup] = await groupDAL.update(
          {
            id: groupId,
            orgId
          },
          {
            name: displayName
          }
        );

        group = modifiedGroup;
      }

      const orgMemberships = members.length
        ? await membershipUserDAL.find({
            [`${TableName.Membership}.scopeOrgId` as "scopeOrgId"]: orgId,
            [`${TableName.Membership}.scope` as "scope"]: AccessScope.Organization,
            $in: {
              id: members.map((member) => member.value)
            }
          })
        : [];

      const membersIdsSet = new Set(orgMemberships.map((orgMembership) => orgMembership.actorUserId as string));
      const userGroupMembers = await userGroupMembershipDAL.find({
        groupId: group.id
      });
      const directMemberUserIds = userGroupMembers.filter((el) => !el.isPending).map((membership) => membership.userId);

      const pendingGroupAdditionsUserIds = userGroupMembers
        .filter((el) => el.isPending)
        .map((pendingGroupAddition) => pendingGroupAddition.userId);

      const allMembersUserIds = directMemberUserIds.concat(pendingGroupAdditionsUserIds);
      const allMembersUserIdsSet = new Set(allMembersUserIds);

      const toAddUserIds = orgMemberships.filter((member) => !allMembersUserIdsSet.has(member.actorUserId as string));
      const toRemoveUserIds = allMembersUserIds.filter((userId) => !membersIdsSet.has(userId));

      if (toAddUserIds.length) {
        await addUsersToGroupByUserIds({
          group,
          userIds: toAddUserIds.map((member) => member.actorUserId as string),
          userDAL,
          userGroupMembershipDAL,
          orgDAL,
          projectKeyDAL,
          projectDAL,
          projectBotDAL,
          membershipGroupDAL,
          tx
        });
      }

      if (toRemoveUserIds.length) {
        await removeUsersFromGroupByUserIds({
          group,
          userIds: toRemoveUserIds,
          userDAL,
          userGroupMembershipDAL,
          membershipGroupDAL,
          projectKeyDAL,
          tx
        });
      }

      return group;
    });

    await $syncNewMembersRoles(group, members);

    return updatedGroup;
  };

  const replaceScimGroup: TScimServiceFactory["replaceScimGroup"] = async ({
    groupId,
    orgId,
    displayName,
    members
  }) => {
    const plan = await licenseService.getPlan(orgId);
    if (!plan.groups)
      throw new BadRequestError({
        message: "Failed to update SCIM group due to plan restriction. Upgrade plan to update SCIM group."
      });

    const org = await orgDAL.findById(orgId);
    if (!org) {
      throw new ScimRequestError({
        detail: "Organization Not Found",
        status: 404
      });
    }

    if (!org.scimEnabled)
      throw new ScimRequestError({
        detail: "SCIM is disabled for the organization",
        status: 403
      });

    const updatedGroup = await $replaceGroupDAL(groupId, orgId, { displayName, members });

    await scimEventsDAL.create({
      orgId,
      eventType: ScimEvent.REPLACE_GROUP,
      event: {
        groupName: updatedGroup.name,
        numberOfMembers: members.length
      }
    });

    return buildScimGroup({
      groupId: updatedGroup.id,
      name: updatedGroup.name,
      members,
      updatedAt: updatedGroup.updatedAt,
      createdAt: updatedGroup.createdAt
    });
  };

  const updateScimGroup: TScimServiceFactory["updateScimGroup"] = async ({ groupId, orgId, operations }) => {
    const plan = await licenseService.getPlan(orgId);
    if (!plan.groups)
      throw new BadRequestError({
        message: "Failed to update SCIM group due to plan restriction. Upgrade plan to update SCIM group."
      });

    const org = await orgDAL.findById(orgId);

    if (!org) {
      throw new ScimRequestError({
        detail: "Organization Not Found",
        status: 404
      });
    }

    if (!org.scimEnabled)
      throw new ScimRequestError({
        detail: "SCIM is disabled for the organization",
        status: 403
      });

    const group = await groupDAL.findOne({
      id: groupId,
      orgId
    });

    if (!group) {
      throw new ScimRequestError({
        detail: "Group Not Found",
        status: 404
      });
    }

    const members = await userGroupMembershipDAL.findGroupMembershipsByGroupIdInOrg(group.id, orgId);
    const scimGroup = buildScimGroup({
      groupId: group.id,
      name: group.name,
      members: members.map((member) => ({
        value: member.orgMembershipId
      })),
      createdAt: group.createdAt,
      updatedAt: group.updatedAt
    });
    scimPatch(scimGroup, operations);
    // remove members is a weird case not following scim convention
    await $replaceGroupDAL(groupId, orgId, { displayName: scimGroup.displayName, members: scimGroup.members });

    const updatedScimMembers = await userGroupMembershipDAL.findGroupMembershipsByGroupIdInOrg(group.id, orgId);

    await scimEventsDAL.create({
      orgId,
      eventType: ScimEvent.UPDATE_GROUP,
      event: {
        groupName: scimGroup.displayName,
        numberOfMembers: updatedScimMembers.length
      }
    });

    return {
      ...scimGroup,
      members: updatedScimMembers.map((member) => ({
        value: member.orgMembershipId,
        display: `${member.firstName ?? ""} ${member.lastName ?? ""}`
      }))
    };
  };

  const deleteScimGroup: TScimServiceFactory["deleteScimGroup"] = async ({ groupId, orgId }) => {
    const plan = await licenseService.getPlan(orgId);
    if (!plan.groups)
      throw new BadRequestError({
        message: "Failed to delete SCIM group due to plan restriction. Upgrade plan to delete SCIM group."
      });

    const org = await orgDAL.findById(orgId);
    if (!org) {
      throw new ScimRequestError({
        detail: "Organization Not Found",
        status: 404
      });
    }

    if (!org.scimEnabled)
      throw new ScimRequestError({
        detail: "SCIM is disabled for the organization",
        status: 403
      });

    const [group] = await groupDAL.delete({
      id: groupId,
      orgId
    });

    if (!group) {
      throw new ScimRequestError({
        detail: "Group Not Found",
        status: 404
      });
    }

    await scimEventsDAL.create({
      orgId,
      eventType: ScimEvent.DELETE_GROUP,
      event: {
        groupName: group.name
      }
    });

    return {}; // intentionally return empty object upon success
  };

  const fnValidateScimToken: TScimServiceFactory["fnValidateScimToken"] = async (token) => {
    const scimToken = await scimDAL.findById(token.scimTokenId);
    if (!scimToken) throw new UnauthorizedError();

    const { ttlDays, createdAt } = scimToken;

    // ttl check
    if (Number(ttlDays) > 0) {
      const currentDate = new Date();
      const scimTokenCreatedAt = new Date(createdAt);
      const ttlInMilliseconds = Number(scimToken.ttlDays) * 86400 * 1000;
      const expirationDate = new Date(scimTokenCreatedAt.getTime() + ttlInMilliseconds);

      if (currentDate > expirationDate)
        throw new ScimRequestError({
          detail: "The access token expired",
          status: 401
        });
    }

    return { scimTokenId: scimToken.id, orgId: scimToken.orgId };
  };

  const notifyExpiringTokens: TScimServiceFactory["notifyExpiringTokens"] = async () => {
    const appCfg = getConfig();
    let processedCount = 0;
    let hasMoreRecords = true;
    let offset = 0;
    const batchSize = 500;

    while (hasMoreRecords) {
      // eslint-disable-next-line no-await-in-loop
      const expiringTokens = await scimDAL.findExpiringTokens(undefined, batchSize, offset);

      if (expiringTokens.length === 0) {
        hasMoreRecords = false;
        break;
      }

      const successfullyNotifiedTokenIds: string[] = [];

      // eslint-disable-next-line no-await-in-loop
      await Promise.all(
        expiringTokens.map(async (token) => {
          try {
            if (token.adminEmails.length === 0) {
              // Still mark as notified to avoid repeated checks
              successfullyNotifiedTokenIds.push(token.id);
              return;
            }

            const createdOn = new Date(token.createdAt);
            const expiringOn = new Date(createdOn.getTime() + Number(token.ttlDays) * 86400 * 1000);

            await smtpService.sendMail({
              recipients: token.adminEmails,
              subjectLine: "SCIM Token Expiry Notice",
              template: SmtpTemplates.ScimTokenExpired,
              substitutions: {
                tokenDescription: token.description,
                orgName: token.orgName,
                url: `${appCfg.SITE_URL}/organizations/${token.orgId}/settings?selectedTab=provisioning-settings`,
                createdOn,
                expiringOn
              }
            });

            successfullyNotifiedTokenIds.push(token.id);
          } catch (error) {
            logger.error(error, `Failed to send expiration notification for SCIM token ${token.id}:`);
          }
        })
      );

      // Batch update all successfully notified tokens in a single query
      if (successfullyNotifiedTokenIds.length > 0) {
        // eslint-disable-next-line no-await-in-loop
        await scimDAL.update({ $in: { id: successfullyNotifiedTokenIds } }, { expiryNotificationSent: true });
      }

      processedCount += expiringTokens.length;
      offset += batchSize;
    }

    return processedCount;
  };

  return {
    createScimToken,
    listScimTokens,
    deleteScimToken,
    listScimEvents,
    listScimUsers,
    getScimUser,
    createScimUser,
    updateScimUser,
    replaceScimUser,
    deleteScimUser,
    listScimGroups,
    createScimGroup,
    getScimGroup,
    deleteScimGroup,
    replaceScimGroup,
    updateScimGroup,
    fnValidateScimToken,
    notifyExpiringTokens
  };
};
