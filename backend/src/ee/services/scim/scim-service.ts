import { ForbiddenError } from "@casl/ability";
import slugify from "@sindresorhus/slugify";
import { Knex } from "knex";
import { scimPatch } from "scim-patch";

import {
  AccessScope,
  OrganizationActionScope,
  OrgMembershipRole,
  OrgMembershipStatus,
  TableName,
  TGroups,
  TMemberships,
  TOrganizations,
  TUsers
} from "@app/db/schemas";
import { TGroupDALFactory } from "@app/ee/services/group/group-dal";
import { addUsersToGroupByUserIds, removeUsersFromGroupByUserIds } from "@app/ee/services/group/group-fns";
import { reapDeletedGroupFolderGrants } from "@app/ee/services/group/group-folder-grant-fns";
import { TIdentityGroupMembershipDALFactory } from "@app/ee/services/group/identity-group-membership-dal";
import { TUserGroupMembershipDALFactory } from "@app/ee/services/group/user-group-membership-dal";
import { TScimDALFactory } from "@app/ee/services/scim/scim-dal";
import { PgSqlLock } from "@app/keystore/keystore";
import { getConfig } from "@app/lib/config/env";
import { crypto } from "@app/lib/crypto";
import { DatabaseErrorCode } from "@app/lib/error-codes";
import { BadRequestError, DatabaseError, NotFoundError, ScimRequestError, UnauthorizedError } from "@app/lib/errors";
import { unique } from "@app/lib/fn";
import { logger } from "@app/lib/logger";
import { ms } from "@app/lib/ms";
import { alphaNumericNanoId } from "@app/lib/nanoid";
import { requestMemoKeys } from "@app/lib/request-context/memo-keys";
import { requestMemoize } from "@app/lib/request-context/request-memoizer";
import { recordScimOperationMetric, ScimOperation } from "@app/lib/telemetry/metrics";
import { sanitizeEmail, validateEmail } from "@app/lib/validator/validate-email";
import { TAdditionalPrivilegeDALFactory } from "@app/services/additional-privilege/additional-privilege-dal";
import { TAlertChannelRecipientDALFactory } from "@app/services/alert/alert-channel-recipient-dal";
import { prepareDeletedGroupAlertRecipientCleanup } from "@app/services/alert/alert-recipient-cleanup-fns";
import { TApprovalPolicyDALFactory } from "@app/services/approval-policy/approval-policy-dal";
import { AuthTokenType } from "@app/services/auth/auth-type";
import { TExternalGroupOrgRoleMappingDALFactory } from "@app/services/external-group-org-role-mapping/external-group-org-role-mapping-dal";
import { PamIdentities, SecretIdentities } from "@app/services/license-client";
import { TUsageMeteringServiceFactory } from "@app/services/license-client/usage";
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
import { TTelemetryServiceFactory } from "@app/services/telemetry/telemetry-service";
import { PostHogEventTypes } from "@app/services/telemetry/telemetry-types";
import { TUserDALFactory } from "@app/services/user/user-dal";
import { TUserAliasDALFactory } from "@app/services/user-alias/user-alias-dal";
import { UserAliasType } from "@app/services/user-alias/user-alias-types";

import { TEmailDomainDALFactory } from "../email-domain/email-domain-dal";
import { verifyEmailDomainOwnership as verifyEmailDomainOwnershipValidate } from "../email-domain/email-domain-fns";
import { TLicenseServiceFactory } from "../license/license-service";
import { OrgPermissionActions, OrgPermissionSubjects } from "../permission/org-permission";
import { TPermissionServiceFactory } from "../permission/permission-service-types";
import { TScimEventsDALFactory } from "./scim-events-dal";
import { buildScimGroup, buildScimGroupList, buildScimUser, buildScimUserList, parseScimFilter } from "./scim-fns";
import { ScimEvent, TScimGroup, TScimServiceFactory } from "./scim-types";

const verifyEmailDomainOwnership = async (args: {
  email: string;
  orgId: string;
  emailDomainDAL: Pick<TEmailDomainDALFactory, "findOne">;
}) => {
  try {
    await verifyEmailDomainOwnershipValidate(args);
  } catch (error) {
    if (error instanceof BadRequestError) {
      throw new ScimRequestError({
        detail: error.message,
        status: 403
      });
    }
    throw error;
  }
};

type TScimServiceFactoryDep = {
  scimDAL: Pick<TScimDALFactory, "create" | "find" | "findById" | "deleteById" | "findExpiringTokens" | "update">;
  userDAL: Pick<
    TUserDALFactory,
    "find" | "findOne" | "create" | "transaction" | "findUserEncKeyByUserIdsBatch" | "findById" | "updateById"
  >;
  userAliasDAL: Pick<TUserAliasDALFactory, "findOne" | "create" | "delete" | "update" | "updateById" | "find">;
  orgDAL: Pick<
    TOrgDALFactory,
    | "createMembership"
    | "findById"
    | "find"
    | "findMembership"
    | "findEffectiveOrgMembership"
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
  identityGroupMembershipDAL: Pick<TIdentityGroupMembershipDALFactory, "find" | "filterProjectsByIdentityMembership">;
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
  approvalPolicyDAL: Pick<TApprovalPolicyDALFactory, "deleteUserStepApproversInProjects">;
  alertChannelRecipientDAL: Pick<TAlertChannelRecipientDALFactory, "pruneOutOfScopeRecipients" | "deleteByPrincipals">;
  scimEventsDAL: Pick<TScimEventsDALFactory, "create" | "findEventsByOrgId">;
  emailDomainDAL: Pick<TEmailDomainDALFactory, "findOne">;
  telemetryService: Pick<TTelemetryServiceFactory, "sendPostHogEvents">;
  usageMeteringService: Pick<TUsageMeteringServiceFactory, "emit">;
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
  identityGroupMembershipDAL,
  membershipUserDAL,
  membershipRoleDAL,
  additionalPrivilegeDAL,
  approvalPolicyDAL,
  alertChannelRecipientDAL,
  scimEventsDAL,
  emailDomainDAL,
  telemetryService,
  usageMeteringService
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
    const org = await requestMemoize(requestMemoKeys.orgFindOrgById(orgId), () => orgDAL.findOrgById(orgId));

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

    const findOpts = {
      ...(startIndex && { offset: startIndex - 1 }),
      ...(limit && { limit })
    };

    const users = await orgDAL.findMembershipWithScimFilter(orgId, filter, org.orgAuthMethod, findOpts);

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
    const org = await requestMemoize(requestMemoKeys.orgFindOrgById(orgId), () => orgDAL.findOrgById(orgId));

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

    // Use findMembershipWithScimFilter with the membershipId parameter
    // This ensures we use the same alias-type and latest-alias selection as listScimUsers
    const [membership] = await orgDAL.findMembershipWithScimFilter(orgId, undefined, org.orgAuthMethod, {
      membershipId: orgMembershipId
    });

    if (!membership)
      throw new ScimRequestError({
        detail: "User not found",
        status: 404
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

    const sanitizedEmail = sanitizeEmail(email);
    validateEmail(sanitizedEmail);

    const org = await requestMemoize(requestMemoKeys.orgFindOrgById(orgId), () => orgDAL.findOrgById(orgId));
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

    const aliasType = org.orgAuthMethod === OrgAuthMethod.OIDC ? UserAliasType.OIDC : UserAliasType.SAML;
    const userAlias = await userAliasDAL.findOne({
      externalId,
      orgId,
      aliasType
    });

    await verifyEmailDomainOwnership({ email, orgId, emailDomainDAL });

    const {
      user: createdUser,
      orgMembership: createdOrgMembership,
      isNewUser
    } = await userDAL.transaction(async (tx) => {
      let user: TUsers | undefined;
      let orgMembership: TMemberships;
      let newUserCreated = false;
      if (userAlias) {
        user = await userDAL.findById(userAlias.userId, tx);
        const effectiveMembership = await membershipUserDAL.findOne(
          {
            actorUserId: user.id,
            scope: AccessScope.Organization,
            scopeOrgId: orgId
          },
          tx
        );

        if (!effectiveMembership) {
          const { role, roleId } = await getDefaultOrgMembershipRole(org.defaultMembershipRole);

          orgMembership = await membershipUserDAL.create(
            {
              actorUserId: userAlias.userId,
              inviteEmail: sanitizedEmail,
              scopeOrgId: orgId,
              scope: AccessScope.Organization,
              status: OrgMembershipStatus.Invited,
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
        } else {
          orgMembership = effectiveMembership;
        }
      } else {
        user = await userDAL.findOne({ username: sanitizedEmail }, tx);
        if (!user) {
          user = await userDAL.create(
            {
              username: sanitizedEmail,
              email: sanitizedEmail,
              isEmailVerified: false,
              firstName,
              lastName,
              authMethods: [],
              isGhost: false
            },
            tx
          );
          newUserCreated = true;
        }

        await userAliasDAL.create(
          {
            userId: user.id,
            aliasType,
            externalId,
            emails: sanitizedEmail ? [sanitizedEmail] : [],
            orgId,
            isEmailVerified: false
          },
          tx
        );

        const effectiveMembership = await membershipUserDAL.findOne(
          {
            actorUserId: user.id,
            scopeOrgId: orgId,
            scope: AccessScope.Organization
          },
          tx
        );

        if (!effectiveMembership) {
          const { role, roleId } = await getDefaultOrgMembershipRole(org.defaultMembershipRole);

          orgMembership = await membershipUserDAL.create(
            {
              actorUserId: user.id,
              inviteEmail: sanitizedEmail,
              scopeOrgId: orgId,
              scope: AccessScope.Organization,
              status: OrgMembershipStatus.Invited,
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
        } else {
          orgMembership = effectiveMembership;
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
            active: orgMembership?.isActive
          }
        },
        tx
      );
      await licenseService.updateSubscriptionOrgMemberCount(org.id);
      return { user, orgMembership, isNewUser: newUserCreated };
    });

    if (isNewUser) {
      void telemetryService.sendPostHogEvents({
        event: PostHogEventTypes.UserSignedUp,
        distinctId: createdUser.username ?? "",
        organizationId: orgId,
        properties: {
          username: createdUser.username,
          email: createdUser.email ?? "",
          signupMethod: "scim"
        }
      });
    }

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
      username: externalId ?? email,
      firstName: createdUser.firstName,
      lastName: createdUser.lastName,
      email: createdUser.email ?? "",
      active: createdOrgMembership.isActive,
      createdAt: createdOrgMembership.createdAt,
      updatedAt: createdOrgMembership.updatedAt
    });
  };

  /**
   * SCIM addresses people by the identifier the IdP asserts, but ours is users.username, which is
   * the mailbox, so someone renamed at the IdP arrives here as a write to a field we treat as
   * immutable. Refusing it leaves our copy stale and puts the provisioning job into a permanent
   * error state. Where the org enforces SSO it has already made the IdP authoritative for identity,
   * so the new address is taken; otherwise the mailbox is still ours and the refusal stands.
   *
   * Returns the address to write, or null when there is nothing to change.
   */
  const $resolveScimEmailChange = async ({
    org,
    user,
    assertedEmail
  }: {
    org: Pick<TOrganizations, "id" | "authEnforced">;
    user: Pick<TUsers, "id" | "email" | "username">;
    assertedEmail?: string | null;
  }): Promise<string | null> => {
    if (!assertedEmail) return null;

    const newEmail = sanitizeEmail(assertedEmail);
    if (newEmail === user.email || newEmail === user.username) return null;

    if (!org.authEnforced) {
      throw new ScimRequestError({
        detail:
          "Email cannot be changed. Enable SSO enforcement for this organization to let your identity provider manage member email addresses.",
        status: 400,
        mutability: "immutable"
      });
    }

    try {
      validateEmail(newEmail);
    } catch (err) {
      throw new ScimRequestError({
        detail: `'${assertedEmail}' is not a valid email address`,
        status: 400,
        scimType: "invalidValue",
        error: err
      });
    }

    try {
      await verifyEmailDomainOwnership({ email: newEmail, orgId: org.id, emailDomainDAL });
    } catch (err) {
      throw new ScimRequestError({
        detail: `'${newEmail}' is not on a verified email domain for this organization. Add and verify the domain in Infisical, then retry.`,
        status: 400,
        scimType: "invalidValue",
        error: err
      });
    }

    const conflictingUser = await userDAL.findOne({ username: newEmail });
    if (conflictingUser && conflictingUser.id !== user.id) {
      throw new ScimRequestError({
        detail: `An Infisical account already exists for '${newEmail}'. Remove or merge that account before changing this user's email.`,
        status: 409,
        scimType: "uniqueness"
      });
    }

    return newEmail;
  };

  /**
   * The conflict check above is a read, not a lock, so a concurrent login or invite can take the
   * address first. Report that as the conflict it is instead of a 500 carrying a constraint name.
   * Only where a rename was actually attempted: the transaction writes other rows too, and calling
   * an unrelated unique violation an email conflict would send the IdP chasing the wrong address.
   */
  const $toScimEmailConflictError = (err: unknown, newEmail: string | null) => {
    if (
      newEmail &&
      err instanceof DatabaseError &&
      (err.error as { code?: string })?.code === DatabaseErrorCode.UniqueViolation
    ) {
      return new ScimRequestError({
        detail: `An Infisical account already exists for '${newEmail}'. Remove or merge that account before changing this user's email.`,
        status: 409,
        scimType: "uniqueness",
        error: err
      });
    }
    return err;
  };

  // partial
  const updateScimUser: TScimServiceFactory["updateScimUser"] = async ({ orgMembershipId, orgId, operations }) => {
    const org = await requestMemoize(requestMemoKeys.orgFindOrgById(orgId), () => orgDAL.findOrgById(orgId));
    if (!org.orgAuthMethod) {
      throw new ScimRequestError({
        detail: "Neither SAML or OIDC SSO is configured",
        status: 400
      });
    }

    const membership = await membershipUserDAL
      .findOne({
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

    if (!org.scimEnabled)
      throw new ScimRequestError({
        detail: "SCIM is disabled for the organization",
        status: 403
      });

    const userAliases = await userAliasDAL.find({
      userId: membership.actorUserId,
      orgId,
      aliasType: org.orgAuthMethod === OrgAuthMethod.OIDC ? UserAliasType.OIDC : UserAliasType.SAML
    });
    const userAliasesIds = userAliases.map((el) => el.id);
    if (!userAliasesIds.length)
      throw new ScimRequestError({
        detail: "User alias not found",
        status: 404
      });

    const user = await userDAL.findOne({ id: membership.actorUserId });
    if (!user)
      throw new ScimRequestError({
        detail: "User not found",
        status: 404
      });

    const scimUser = buildScimUser({
      orgMembershipId: membership.id,
      email: user.email,
      lastName: user.lastName,
      firstName: user.firstName,
      active: membership.isActive,
      username: userAliases?.[0]?.externalId ?? user.username,
      createdAt: membership.createdAt,
      updatedAt: membership.updatedAt
    });
    scimPatch(scimUser, operations);

    const newEmail = await $resolveScimEmailChange({
      org,
      user,
      assertedEmail: (scimUser.emails?.find((email) => email.primary) ?? scimUser.emails?.[0])?.value
    });

    await verifyEmailDomainOwnership({
      email: user.username,
      orgId,
      emailDomainDAL
    });

    try {
      await userDAL.transaction(async (tx) => {
        await membershipUserDAL.updateById(
          membership.id,
          {
            isActive: scimUser.active
          },
          tx
        );
        await userDAL.updateById(
          membership.actorUserId as string,
          {
            firstName: scimUser.name.givenName,
            lastName: scimUser.name.familyName,
            ...(newEmail ? { email: newEmail, username: newEmail } : {})
          },
          tx
        );

        // The old address stays on the alias: it is what past assertions carried, and dropping it
        // would make a login in flight from before the rename look stale.
        if (newEmail) {
          await Promise.all(
            userAliases.map((alias) =>
              userAliasDAL.updateById(alias.id, { emails: unique([...(alias.emails ?? []), newEmail]) }, tx)
            )
          );
        }

        await scimEventsDAL.create(
          {
            orgId,
            eventType: ScimEvent.UPDATE_USER,
            event: {
              firstName: scimUser.name.givenName,
              email: scimUser.userName,
              lastName: scimUser.name.familyName,
              active: scimUser.active,
              ...(newEmail ? { previousEmail: user.username, newEmail } : {})
            }
          },
          tx
        );
      });
    } catch (err) {
      throw $toScimEmailConflictError(err, newEmail);
    }

    return scimUser;
  };

  const replaceScimUser: TScimServiceFactory["replaceScimUser"] = async ({
    orgMembershipId,
    active,
    orgId,
    lastName,
    firstName,
    email: unsanitizedEmail,
    externalId
  }) => {
    const org = await requestMemoize(requestMemoKeys.orgFindOrgById(orgId), () => orgDAL.findOrgById(orgId));
    if (!org.orgAuthMethod) {
      throw new ScimRequestError({
        detail: "Neither SAML or OIDC SSO is configured",
        status: 400
      });
    }

    const email = unsanitizedEmail?.toLowerCase();
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

    const aliasType = org.orgAuthMethod === OrgAuthMethod.OIDC ? UserAliasType.OIDC : UserAliasType.SAML;

    const userAliases = await userAliasDAL.find({
      userId: membership.actorUserId,
      orgId,
      aliasType
    });
    if (!userAliases.length)
      throw new ScimRequestError({
        detail: "User alias not found",
        status: 404
      });

    const user = await userDAL.findOne({ id: membership.actorUserId });

    const newEmail = await $resolveScimEmailChange({ org, user, assertedEmail: email });

    await verifyEmailDomainOwnership({
      email: user.username,
      orgId,
      emailDomainDAL
    });

    try {
      await userDAL.transaction(async (tx) => {
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
            lastName,
            ...(newEmail ? { email: newEmail, username: newEmail } : {})
          },
          tx
        );

        // Update externalId on existing alias if provided and changed. The old address stays on the
        // alias: it is what past assertions carried, and dropping it would make a login in flight
        // from before the rename look stale.
        await Promise.all(
          userAliases.map((alias) =>
            userAliasDAL.updateById(
              alias.id,
              {
                externalId,
                ...(newEmail ? { emails: unique([...(alias.emails ?? []), newEmail]) } : {})
              },
              tx
            )
          )
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
              active,
              ...(newEmail ? { previousEmail: user.username, newEmail } : {})
            }
          },
          tx
        );
      });
    } catch (err) {
      throw $toScimEmailConflictError(err, newEmail);
    }

    return buildScimUser({
      orgMembershipId: membership.id,
      username: externalId || user.username,
      email: newEmail ?? user.email,
      firstName: firstName || user.firstName,
      lastName: lastName || user.lastName,
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

    // Return success even if user not found (idempotent delete per SCIM RFC 7644)
    if (!membership) {
      return {};
    }

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
      additionalPrivilegeDAL,
      approvalPolicyDAL,
      alertChannelRecipientDAL
    });

    // Deprovisioning cascades the user's project + group memberships, changing the identity meters.
    usageMeteringService.emit(membership.scopeOrgId, SecretIdentities.key);
    usageMeteringService.emit(membership.scopeOrgId, PamIdentities.key);

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

    const org = await requestMemoize(requestMemoKeys.orgFindById(orgId), () => orgDAL.findById(orgId));
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
        ...(filter && parseScimFilter(filter)),
        orgId
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

  const $syncNewMembersRoles = async (group: TGroups, members: TScimGroup["members"], tx?: Knex) => {
    // this function handles configuring newly provisioned users org membership if an external group mapping exists

    if (!members.length) return;

    const externalGroupMapping = await externalGroupOrgRoleMappingDAL.findOne(
      {
        orgId: group.orgId,
        groupName: group.name
      },
      tx
    );

    // no mapping, user will have default org membership
    if (!externalGroupMapping) return;

    // only get org memberships that are new (invites), scoped to the group's organization
    // (consistent with the other membership lookups in this service)
    const newOrgMemberships = await membershipUserDAL.find(
      {
        status: "invited",
        scope: AccessScope.Organization,
        scopeOrgId: group.orgId,
        $in: {
          id: members.map((member) => member.value)
        }
      },
      { tx }
    );

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
      },
      tx
    );
  };

  const createScimGroup: TScimServiceFactory["createScimGroup"] = async ({ displayName, orgId, members }) => {
    const plan = await licenseService.getPlan(orgId);
    if (!plan.groups)
      throw new BadRequestError({
        message: "Failed to create a SCIM group due to plan restriction. Upgrade plan to create a SCIM group."
      });

    const org = await requestMemoize(requestMemoKeys.orgFindById(orgId), () => orgDAL.findById(orgId));

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
          orgId
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
        const orgMemberships = await membershipUserDAL.find(
          {
            scope: AccessScope.Organization,
            scopeOrgId: orgId,
            $in: {
              id: members.map((member) => member.value)
            }
          },
          { tx }
        );

        const newMembers = await addUsersToGroupByUserIds({
          usageMeteringService,
          group,
          userIds: orgMemberships.map((membership) => membership.actorUserId as string),
          userDAL,
          userGroupMembershipDAL,
          orgDAL,
          projectKeyDAL,
          projectDAL,
          projectBotDAL,
          membershipGroupDAL,
          tx,
          shouldFailOnMissingMembers: false
        });

        await $syncNewMembersRoles(group, members, tx);

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

  const getScimGroup: TScimServiceFactory["getScimGroup"] = async ({ groupId, orgId, isMembersExcluded }) => {
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

    if (isMembersExcluded) {
      await scimEventsDAL.create({
        orgId,
        eventType: ScimEvent.GET_GROUP,
        event: {
          groupName: group.name
        }
      });

      const scimGroup = buildScimGroup({
        groupId: group.id,
        name: group.name,
        members: [],
        createdAt: group.createdAt,
        updatedAt: group.updatedAt
      });
      const { members, ...scimGroupWithoutMembers } = scimGroup;
      return scimGroupWithoutMembers as TScimGroup;
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
    {
      displayName,
      members = [],
      shouldFailOnMissingMembers = true,
      tx: outerTx
    }: { displayName: string; members: { value: string }[]; shouldFailOnMissingMembers?: boolean; tx?: Knex }
  ) => {
    const processReplacement = async (tx: Knex) => {
      let group = await groupDAL.findOne(
        {
          id: groupId,
          orgId
        },
        tx
      );

      if (!group) {
        throw new ScimRequestError({
          detail: "Group Not Found",
          status: 404
        });
      }

      if (group.name !== displayName) {
        await externalGroupOrgRoleMappingDAL.update(
          {
            groupName: group.name,
            orgId
          },
          {
            groupName: displayName
          },
          tx
        );

        const [modifiedGroup] = await groupDAL.update(
          {
            id: groupId,
            orgId
          },
          {
            name: displayName
          },
          tx
        );

        group = modifiedGroup;
      }

      const orgMemberships = members.length
        ? await membershipUserDAL.find(
            {
              [`${TableName.Membership}.scopeOrgId` as "scopeOrgId"]: orgId,
              [`${TableName.Membership}.scope` as "scope"]: AccessScope.Organization,
              $in: {
                id: members.map((member) => member.value)
              }
            },
            {
              tx
            }
          )
        : [];

      const membersIdsSet = new Set(orgMemberships.map((orgMembership) => orgMembership.actorUserId as string));
      const userGroupMembers = await userGroupMembershipDAL.find(
        {
          groupId: group.id
        },
        { tx }
      );
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
          usageMeteringService,
          group,
          userIds: toAddUserIds.map((member) => member.actorUserId as string),
          userDAL,
          userGroupMembershipDAL,
          orgDAL,
          projectKeyDAL,
          projectDAL,
          projectBotDAL,
          membershipGroupDAL,
          tx,
          shouldFailOnMissingMembers
        });
      }

      if (toRemoveUserIds.length) {
        await removeUsersFromGroupByUserIds({
          usageMeteringService,
          group,
          userIds: toRemoveUserIds,
          userDAL,
          userGroupMembershipDAL,
          membershipGroupDAL,
          projectKeyDAL,
          additionalPrivilegeDAL,
          alertChannelRecipientDAL,
          tx,
          shouldFailOnMissingMembers
        });
      }

      return group;
    };

    let updatedGroup: TGroups;
    if (outerTx) {
      updatedGroup = await processReplacement(outerTx);
      await $syncNewMembersRoles(updatedGroup, members, outerTx);
    } else {
      updatedGroup = await groupDAL.transaction(async (tx) => {
        const replacedGroup = await processReplacement(tx);
        await $syncNewMembersRoles(updatedGroup, members, tx);
        return replacedGroup;
      });
    }

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

    const org = await requestMemoize(requestMemoKeys.orgFindById(orgId), () => orgDAL.findById(orgId));
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

    const updatedGroup = await groupDAL.transaction(async (tx) => {
      // Acquire advisory lock to serialize concurrent SCIM PUT requests for the same group
      await tx.raw("SELECT pg_advisory_xact_lock(?)", [PgSqlLock.ScimGroupUpdate(groupId)]);

      return $replaceGroupDAL(groupId, orgId, {
        displayName,
        members,
        shouldFailOnMissingMembers: false,
        tx
      });
    });

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

    const org = await requestMemoize(requestMemoKeys.orgFindById(orgId), () => orgDAL.findById(orgId));

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

    const { scimGroup, updatedScimMembers } = await groupDAL.transaction(async (tx) => {
      // Acquire advisory lock to serialize concurrent SCIM PATCH requests for the same group
      await tx.raw("SELECT pg_advisory_xact_lock(?)", [PgSqlLock.ScimGroupUpdate(groupId)]);

      const group = await groupDAL.findOne(
        {
          id: groupId,
          orgId
        },
        tx
      );

      if (!group) {
        throw new ScimRequestError({
          detail: "Group Not Found",
          status: 404
        });
      }

      const members = await userGroupMembershipDAL.findGroupMembershipsByGroupIdInOrg(group.id, orgId, tx);
      const patchedScimGroup = buildScimGroup({
        groupId: group.id,
        name: group.name,
        members: members.map((member) => ({
          value: member.orgMembershipId
        })),
        createdAt: group.createdAt,
        updatedAt: group.updatedAt
      });
      scimPatch(patchedScimGroup, operations);

      // Apply the patched state with idempotent operations
      await $replaceGroupDAL(groupId, orgId, {
        displayName: patchedScimGroup.displayName,
        members: patchedScimGroup.members,
        shouldFailOnMissingMembers: false,
        tx
      });

      const finalMembers = await userGroupMembershipDAL.findGroupMembershipsByGroupIdInOrg(group.id, orgId, tx);

      return { scimGroup: patchedScimGroup, updatedScimMembers: finalMembers };
    });

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

    const org = await requestMemoize(requestMemoKeys.orgFindById(orgId), () => orgDAL.findById(orgId));
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

    const [group] = await groupDAL.transaction(async (tx) => {
      const finalizeAlertRecipients = await prepareDeletedGroupAlertRecipientCleanup(
        { userGroupMembershipDAL, alertChannelRecipientDAL },
        groupId,
        tx
      );

      await reapDeletedGroupFolderGrants(
        { userGroupMembershipDAL, identityGroupMembershipDAL, membershipGroupDAL, additionalPrivilegeDAL },
        groupId,
        tx
      );

      const deleted = await groupDAL.delete({ id: groupId, orgId }, tx);
      if (!deleted.length) return deleted;

      await finalizeAlertRecipients();

      return deleted;
    });

    // Return success even if group not found (idempotent delete per SCIM RFC 7644)
    if (!group) {
      return {};
    }

    await scimEventsDAL.create({
      orgId,
      eventType: ScimEvent.DELETE_GROUP,
      event: {
        groupName: group.name
      }
    });

    return {};
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

  const withScimMetric =
    <TArgs extends [{ orgId?: string }, ...unknown[]], TReturn>(
      operation: ScimOperation,
      fn: (...args: TArgs) => Promise<TReturn>
    ) =>
    async (...args: TArgs): Promise<TReturn> => {
      const startTime = performance.now();
      const orgId = args[0]?.orgId;
      try {
        const result = await fn(...args);
        recordScimOperationMetric({ startTime, operation, outcome: "success", orgId });
        return result;
      } catch (error) {
        recordScimOperationMetric({ startTime, operation, outcome: "failure", orgId, error });
        throw error;
      }
    };

  return {
    createScimToken,
    listScimTokens,
    deleteScimToken,
    listScimEvents,
    listScimUsers,
    getScimUser,
    createScimUser: withScimMetric(ScimOperation.CreateUser, createScimUser),
    updateScimUser: withScimMetric(ScimOperation.UpdateUser, updateScimUser),
    replaceScimUser: withScimMetric(ScimOperation.ReplaceUser, replaceScimUser),
    deleteScimUser: withScimMetric(ScimOperation.DeleteUser, deleteScimUser),
    listScimGroups,
    createScimGroup: withScimMetric(ScimOperation.CreateGroup, createScimGroup),
    getScimGroup,
    deleteScimGroup: withScimMetric(ScimOperation.DeleteGroup, deleteScimGroup),
    replaceScimGroup: withScimMetric(ScimOperation.ReplaceGroup, replaceScimGroup),
    updateScimGroup: withScimMetric(ScimOperation.UpdateGroup, updateScimGroup),
    fnValidateScimToken,
    notifyExpiringTokens
  };
};
