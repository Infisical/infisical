import { ForbiddenError } from "@casl/ability";
import slugify from "@sindresorhus/slugify";
import jwt from "jsonwebtoken";

import { OrgMembershipRole, OrgMembershipStatus, TableName, TOrgMemberships, TUsers } from "@app/db/schemas";
import { TGroupDALFactory } from "@app/ee/services/group/group-dal";
import { addUsersToGroupByUserIds, removeUsersFromGroupByUserIds } from "@app/ee/services/group/group-fns";
import { TUserGroupMembershipDALFactory } from "@app/ee/services/group/user-group-membership-dal";
import { TScimDALFactory } from "@app/ee/services/scim/scim-dal";
import { getConfig } from "@app/lib/config/env";
import { BadRequestError, ScimRequestError, UnauthorizedError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { alphaNumericNanoId } from "@app/lib/nanoid";
import { TOrgPermission } from "@app/lib/types";
import { AuthTokenType } from "@app/services/auth/auth-type";
import { TGroupProjectDALFactory } from "@app/services/group-project/group-project-dal";
import { TOrgDALFactory } from "@app/services/org/org-dal";
import { deleteOrgMembershipFn } from "@app/services/org/org-fns";
import { TOrgMembershipDALFactory } from "@app/services/org-membership/org-membership-dal";
import { TProjectDALFactory } from "@app/services/project/project-dal";
import { TProjectBotDALFactory } from "@app/services/project-bot/project-bot-dal";
import { TProjectKeyDALFactory } from "@app/services/project-key/project-key-dal";
import { TProjectMembershipDALFactory } from "@app/services/project-membership/project-membership-dal";
import { SmtpTemplates, TSmtpService } from "@app/services/smtp/smtp-service";
import { getServerCfg } from "@app/services/super-admin/super-admin-service";
import { TUserDALFactory } from "@app/services/user/user-dal";
import { normalizeUsername } from "@app/services/user/user-fns";
import { TUserAliasDALFactory } from "@app/services/user-alias/user-alias-dal";
import { UserAliasType } from "@app/services/user-alias/user-alias-types";

import { TLicenseServiceFactory } from "../license/license-service";
import { OrgPermissionActions, OrgPermissionSubjects } from "../permission/org-permission";
import { TPermissionServiceFactory } from "../permission/permission-service";
import { TProjectUserAdditionalPrivilegeDALFactory } from "../project-user-additional-privilege/project-user-additional-privilege-dal";
import {
  buildScimGroup,
  buildScimGroupList,
  buildScimUser,
  buildScimUserList,
  extractScimValueFromPath,
  parseScimFilter
} from "./scim-fns";
import {
  TCreateScimGroupDTO,
  TCreateScimTokenDTO,
  TCreateScimUserDTO,
  TDeleteScimGroupDTO,
  TDeleteScimTokenDTO,
  TDeleteScimUserDTO,
  TGetScimGroupDTO,
  TGetScimUserDTO,
  TListScimGroupsDTO,
  TListScimUsers,
  TListScimUsersDTO,
  TReplaceScimUserDTO,
  TScimGroup,
  TScimTokenJwtPayload,
  TUpdateScimGroupNamePatchDTO,
  TUpdateScimGroupNamePutDTO,
  TUpdateScimUserDTO
} from "./scim-types";

type TScimServiceFactoryDep = {
  scimDAL: Pick<TScimDALFactory, "create" | "find" | "findById" | "deleteById">;
  userDAL: Pick<
    TUserDALFactory,
    "find" | "findOne" | "create" | "transaction" | "findUserEncKeyByUserIdsBatch" | "findById"
  >;
  userAliasDAL: Pick<TUserAliasDALFactory, "findOne" | "create" | "delete">;
  orgDAL: Pick<
    TOrgDALFactory,
    "createMembership" | "findById" | "findMembership" | "deleteMembershipById" | "transaction" | "updateMembershipById"
  >;
  orgMembershipDAL: Pick<TOrgMembershipDALFactory, "find" | "findOne" | "create" | "updateById" | "findById">;
  projectDAL: Pick<TProjectDALFactory, "find" | "findProjectGhostUser">;
  projectMembershipDAL: Pick<TProjectMembershipDALFactory, "find" | "delete" | "findProjectMembershipsByUserId">;
  groupDAL: Pick<
    TGroupDALFactory,
    "create" | "findOne" | "findAllGroupMembers" | "delete" | "findGroups" | "transaction" | "updateById" | "update"
  >;
  groupProjectDAL: Pick<TGroupProjectDALFactory, "find">;
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
  projectUserAdditionalPrivilegeDAL: Pick<TProjectUserAdditionalPrivilegeDALFactory, "delete">;
};

export type TScimServiceFactory = ReturnType<typeof scimServiceFactory>;

export const scimServiceFactory = ({
  licenseService,
  scimDAL,
  userDAL,
  userAliasDAL,
  orgDAL,
  orgMembershipDAL,
  projectDAL,
  projectMembershipDAL,
  groupDAL,
  groupProjectDAL,
  userGroupMembershipDAL,
  projectKeyDAL,
  projectBotDAL,
  permissionService,
  projectUserAdditionalPrivilegeDAL,
  smtpService
}: TScimServiceFactoryDep) => {
  const createScimToken = async ({
    actor,
    actorId,
    actorOrgId,
    actorAuthMethod,
    orgId,
    description,
    ttlDays
  }: TCreateScimTokenDTO) => {
    const { permission } = await permissionService.getOrgPermission(actor, actorId, orgId, actorAuthMethod, actorOrgId);
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

    const scimToken = jwt.sign(
      {
        scimTokenId: scimTokenData.id,
        authTokenType: AuthTokenType.SCIM_TOKEN
      },
      appCfg.AUTH_SECRET
    );

    return { scimToken };
  };

  const listScimTokens = async ({ actor, actorId, actorOrgId, actorAuthMethod, orgId }: TOrgPermission) => {
    const { permission } = await permissionService.getOrgPermission(actor, actorId, orgId, actorAuthMethod, actorOrgId);
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Read, OrgPermissionSubjects.Scim);

    const plan = await licenseService.getPlan(orgId);
    if (!plan.scim)
      throw new BadRequestError({
        message: "Failed to get SCIM tokens due to plan restriction. Upgrade plan to get SCIM tokens."
      });

    const scimTokens = await scimDAL.find({ orgId });
    return scimTokens;
  };

  const deleteScimToken = async ({ scimTokenId, actor, actorId, actorAuthMethod, actorOrgId }: TDeleteScimTokenDTO) => {
    let scimToken = await scimDAL.findById(scimTokenId);
    if (!scimToken) throw new BadRequestError({ message: "Failed to find SCIM token to delete" });

    const { permission } = await permissionService.getOrgPermission(
      actor,
      actorId,
      scimToken.orgId,
      actorAuthMethod,
      actorOrgId
    );
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Delete, OrgPermissionSubjects.Scim);

    const plan = await licenseService.getPlan(scimToken.orgId);
    if (!plan.scim)
      throw new BadRequestError({
        message: "Failed to delete the SCIM token due to plan restriction. Upgrade plan to delete the SCIM token."
      });

    scimToken = await scimDAL.deleteById(scimTokenId);

    return scimToken;
  };

  // SCIM server endpoints
  const listScimUsers = async ({ startIndex, limit, filter, orgId }: TListScimUsersDTO): Promise<TListScimUsers> => {
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

    const users = await orgDAL.findMembership(
      {
        [`${TableName.OrgMembership}.orgId` as "id"]: orgId,
        ...parseScimFilter(filter)
      },
      findOpts
    );

    const scimUsers = users.map(({ id, externalId, username, firstName, lastName, email, isActive }) =>
      buildScimUser({
        orgMembershipId: id ?? "",
        username: externalId ?? username,
        firstName: firstName ?? "",
        lastName: lastName ?? "",
        email,
        active: isActive
      })
    );

    return buildScimUserList({
      scimUsers,
      startIndex,
      limit
    });
  };

  const getScimUser = async ({ orgMembershipId, orgId }: TGetScimUserDTO) => {
    const [membership] = await orgDAL
      .findMembership({
        [`${TableName.OrgMembership}.id` as "id"]: orgMembershipId,
        [`${TableName.OrgMembership}.orgId` as "orgId"]: orgId
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

    const groupMembershipsInOrg = await userGroupMembershipDAL.findGroupMembershipsByUserIdInOrg(
      membership.userId,
      orgId
    );

    return buildScimUser({
      orgMembershipId: membership.id,
      username: membership.externalId ?? membership.username,
      email: membership.email ?? "",
      firstName: membership.firstName as string,
      lastName: membership.lastName as string,
      active: membership.isActive,
      groups: groupMembershipsInOrg.map((group) => ({
        value: group.groupId,
        display: group.groupName
      }))
    });
  };

  const createScimUser = async ({ externalId, email, firstName, lastName, orgId }: TCreateScimUserDTO) => {
    if (!email) throw new ScimRequestError({ detail: "Invalid request. Missing email.", status: 400 });

    const org = await orgDAL.findById(orgId);

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

    const appCfg = getConfig();
    const serverCfg = await getServerCfg();

    const userAlias = await userAliasDAL.findOne({
      externalId,
      orgId,
      aliasType: UserAliasType.SAML
    });

    const { user: createdUser, orgMembership: createdOrgMembership } = await userDAL.transaction(async (tx) => {
      let user: TUsers | undefined;
      let orgMembership: TOrgMemberships;
      if (userAlias) {
        user = await userDAL.findById(userAlias.userId, tx);
        orgMembership = await orgMembershipDAL.findOne(
          {
            userId: user.id,
            orgId
          },
          tx
        );

        if (!orgMembership) {
          orgMembership = await orgMembershipDAL.create(
            {
              userId: userAlias.userId,
              inviteEmail: email,
              orgId,
              role: OrgMembershipRole.Member,
              status: user.isAccepted ? OrgMembershipStatus.Accepted : OrgMembershipStatus.Invited, // if user is fully completed, then set status to accepted, otherwise set it to invited so we can update it later
              isActive: true
            },
            tx
          );
        } else if (orgMembership.status === OrgMembershipStatus.Invited && user.isAccepted) {
          orgMembership = await orgMembershipDAL.updateById(
            orgMembership.id,
            {
              status: OrgMembershipStatus.Accepted
            },
            tx
          );
        }
      } else {
        if (serverCfg.trustSamlEmails) {
          user = await userDAL.findOne(
            {
              email,
              isEmailVerified: true
            },
            tx
          );
        }

        if (!user) {
          const uniqueUsername = await normalizeUsername(`${firstName}-${lastName}`, userDAL);
          user = await userDAL.create(
            {
              username: serverCfg.trustSamlEmails ? email : uniqueUsername,
              email,
              isEmailVerified: serverCfg.trustSamlEmails,
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
            aliasType: UserAliasType.SAML,
            externalId,
            emails: email ? [email] : [],
            orgId
          },
          tx
        );

        const [foundOrgMembership] = await orgDAL.findMembership(
          {
            [`${TableName.OrgMembership}.userId` as "userId"]: user.id,
            [`${TableName.OrgMembership}.orgId` as "id"]: orgId
          },
          { tx }
        );

        orgMembership = foundOrgMembership;

        if (!orgMembership) {
          orgMembership = await orgMembershipDAL.create(
            {
              userId: user.id,
              inviteEmail: email,
              orgId,
              role: OrgMembershipRole.Member,
              status: user.isAccepted ? OrgMembershipStatus.Accepted : OrgMembershipStatus.Invited, // if user is fully completed, then set status to accepted, otherwise set it to invited so we can update it later
              isActive: true
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
          callback_url: `${appCfg.SITE_URL}/api/v1/sso/redirect/saml2/organizations/${org.slug}`
        }
      });
    }

    return buildScimUser({
      orgMembershipId: createdOrgMembership.id,
      username: externalId,
      firstName: createdUser.firstName as string,
      lastName: createdUser.lastName as string,
      email: createdUser.email ?? "",
      active: createdOrgMembership.isActive
    });
  };

  const updateScimUser = async ({ orgMembershipId, orgId, operations }: TUpdateScimUserDTO) => {
    const [membership] = await orgDAL
      .findMembership({
        [`${TableName.OrgMembership}.id` as "id"]: orgMembershipId,
        [`${TableName.OrgMembership}.orgId` as "orgId"]: orgId
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

    let active = true;

    operations.forEach((operation) => {
      if (operation.op.toLowerCase() === "replace") {
        if (operation.path === "active" && operation.value === "False") {
          // azure scim op format
          active = false;
        } else if (typeof operation.value === "object" && operation.value.active === false) {
          // okta scim op format
          active = false;
        }
      }
    });

    if (!active) {
      await orgMembershipDAL.updateById(membership.id, {
        isActive: false
      });
    }

    return buildScimUser({
      orgMembershipId: membership.id,
      username: membership.externalId ?? membership.username,
      email: membership.email,
      firstName: membership.firstName as string,
      lastName: membership.lastName as string,
      active
    });
  };

  const replaceScimUser = async ({ orgMembershipId, active, orgId }: TReplaceScimUserDTO) => {
    const [membership] = await orgDAL
      .findMembership({
        [`${TableName.OrgMembership}.id` as "id"]: orgMembershipId,
        [`${TableName.OrgMembership}.orgId` as "orgId"]: orgId
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

    await orgMembershipDAL.updateById(membership.id, {
      isActive: active
    });

    const groupMembershipsInOrg = await userGroupMembershipDAL.findGroupMembershipsByUserIdInOrg(
      membership.userId,
      orgId
    );

    return buildScimUser({
      orgMembershipId: membership.id,
      username: membership.externalId ?? membership.username,
      email: membership.email,
      firstName: membership.firstName as string,
      lastName: membership.lastName as string,
      active,
      groups: groupMembershipsInOrg.map((group) => ({
        value: group.groupId,
        display: group.groupName
      }))
    });
  };

  const deleteScimUser = async ({ orgMembershipId, orgId }: TDeleteScimUserDTO) => {
    const [membership] = await orgDAL.findMembership({
      [`${TableName.OrgMembership}.id` as "id"]: orgMembershipId,
      [`${TableName.OrgMembership}.orgId` as "orgId"]: orgId
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

    await deleteOrgMembershipFn({
      orgMembershipId: membership.id,
      orgId: membership.orgId,
      orgDAL,
      projectMembershipDAL,
      projectUserAdditionalPrivilegeDAL,
      projectKeyDAL,
      userAliasDAL,
      licenseService
    });

    return {}; // intentionally return empty object upon success
  };

  const listScimGroups = async ({ orgId, startIndex, limit, filter }: TListScimGroupsDTO) => {
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

    for await (const group of groups) {
      const members = await userGroupMembershipDAL.findGroupMembershipsByGroupIdInOrg(group.id, orgId);
      const scimGroup = buildScimGroup({
        groupId: group.id,
        name: group.name,
        members: members.map((member) => ({
          value: member.orgMembershipId,
          display: `${member.firstName ?? ""} ${member.lastName ?? ""}`
        }))
      });
      scimGroups.push(scimGroup);
    }

    return buildScimGroupList({
      scimGroups,
      startIndex,
      limit
    });
  };

  const createScimGroup = async ({ displayName, orgId, members }: TCreateScimGroupDTO) => {
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
      const group = await groupDAL.create(
        {
          name: displayName,
          slug: slugify(`${displayName}-${alphaNumericNanoId(4)}`),
          orgId,
          role: OrgMembershipRole.NoAccess
        },
        tx
      );

      if (members && members.length) {
        const orgMemberships = await orgMembershipDAL.find({
          $in: {
            id: members.map((member) => member.value)
          }
        });

        const newMembers = await addUsersToGroupByUserIds({
          group,
          userIds: orgMemberships.map((membership) => membership.userId as string),
          userDAL,
          userGroupMembershipDAL,
          orgDAL,
          groupProjectDAL,
          projectKeyDAL,
          projectDAL,
          projectBotDAL,
          tx
        });

        return { group, newMembers };
      }

      return { group, newMembers: [] };
    });

    const orgMemberships = await orgDAL.findMembership({
      [`${TableName.OrgMembership}.orgId` as "orgId"]: orgId,
      $in: {
        [`${TableName.OrgMembership}.userId` as "userId"]: newGroup.newMembers.map((member) => member.id)
      }
    });

    return buildScimGroup({
      groupId: newGroup.group.id,
      name: newGroup.group.name,
      members: orgMemberships.map(({ id, firstName, lastName }) => ({
        value: id,
        display: `${firstName} ${lastName}`
      }))
    });
  };

  const getScimGroup = async ({ groupId, orgId }: TGetScimGroupDTO) => {
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

    const users = await groupDAL.findAllGroupMembers({
      orgId: group.orgId,
      groupId: group.id
    });

    const orgMemberships = await orgDAL.findMembership({
      [`${TableName.OrgMembership}.orgId` as "orgId"]: orgId,
      $in: {
        [`${TableName.OrgMembership}.userId` as "userId"]: users
          .filter((user) => user.isPartOfGroup)
          .map((user) => user.id)
      }
    });

    return buildScimGroup({
      groupId: group.id,
      name: group.name,
      members: orgMemberships.map(({ id, firstName, lastName }) => ({
        value: id,
        display: `${firstName} ${lastName}`
      }))
    });
  };

  const updateScimGroupNamePut = async ({ groupId, orgId, displayName, members }: TUpdateScimGroupNamePutDTO) => {
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

    const updatedGroup = await groupDAL.transaction(async (tx) => {
      const [group] = await groupDAL.update(
        {
          id: groupId,
          orgId
        },
        {
          name: displayName
        }
      );

      if (!group) {
        throw new ScimRequestError({
          detail: "Group Not Found",
          status: 404
        });
      }

      if (members) {
        const orgMemberships = await orgMembershipDAL.find({
          $in: {
            id: members.map((member) => member.value)
          }
        });

        const membersIdsSet = new Set(orgMemberships.map((orgMembership) => orgMembership.userId));

        const directMemberUserIds = (
          await userGroupMembershipDAL.find({
            groupId: group.id,
            isPending: false
          })
        ).map((membership) => membership.userId);

        const pendingGroupAdditionsUserIds = (
          await userGroupMembershipDAL.find({
            groupId: group.id,
            isPending: true
          })
        ).map((pendingGroupAddition) => pendingGroupAddition.userId);

        const allMembersUserIds = directMemberUserIds.concat(pendingGroupAdditionsUserIds);
        const allMembersUserIdsSet = new Set(allMembersUserIds);

        const toAddUserIds = orgMemberships.filter((member) => !allMembersUserIdsSet.has(member.userId as string));
        const toRemoveUserIds = allMembersUserIds.filter((userId) => !membersIdsSet.has(userId));

        if (toAddUserIds.length) {
          await addUsersToGroupByUserIds({
            group,
            userIds: toAddUserIds.map((member) => member.userId as string),
            userDAL,
            userGroupMembershipDAL,
            orgDAL,
            groupProjectDAL,
            projectKeyDAL,
            projectDAL,
            projectBotDAL,
            tx
          });
        }

        if (toRemoveUserIds.length) {
          await removeUsersFromGroupByUserIds({
            group,
            userIds: toRemoveUserIds,
            userDAL,
            userGroupMembershipDAL,
            groupProjectDAL,
            projectKeyDAL,
            tx
          });
        }
      }

      return group;
    });

    return buildScimGroup({
      groupId: updatedGroup.id,
      name: updatedGroup.name,
      members
    });
  };

  const updateScimGroupNamePatch = async ({ groupId, orgId, operations }: TUpdateScimGroupNamePatchDTO) => {
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

    for await (const operation of operations) {
      switch (operation.op) {
        case "replace": {
          group = await groupDAL.updateById(group.id, {
            name: operation.value.displayName
          });
          break;
        }
        case "add": {
          try {
            const orgMemberships = await orgMembershipDAL.find({
              $in: {
                id: operation.value.map((member) => member.value)
              }
            });

            await addUsersToGroupByUserIds({
              group,
              userIds: orgMemberships.map((membership) => membership.userId as string),
              userDAL,
              userGroupMembershipDAL,
              orgDAL,
              groupProjectDAL,
              projectKeyDAL,
              projectDAL,
              projectBotDAL
            });
          } catch {
            logger.info("Repeat SCIM user-group add operation");
          }

          break;
        }
        case "remove": {
          const orgMembershipId = extractScimValueFromPath(operation.path);
          if (!orgMembershipId) throw new ScimRequestError({ detail: "Invalid path value", status: 400 });
          const orgMembership = await orgMembershipDAL.findById(orgMembershipId);
          if (!orgMembership) throw new ScimRequestError({ detail: "Org Membership Not Found", status: 400 });
          await removeUsersFromGroupByUserIds({
            group,
            userIds: [orgMembership.userId as string],
            userDAL,
            userGroupMembershipDAL,
            groupProjectDAL,
            projectKeyDAL
          });
          break;
        }
        default: {
          throw new ScimRequestError({
            detail: "Invalid Operation",
            status: 400
          });
        }
      }
    }

    const members = await userGroupMembershipDAL.findGroupMembershipsByGroupIdInOrg(group.id, orgId);

    return buildScimGroup({
      groupId: group.id,
      name: group.name,
      members: members.map((member) => ({
        value: member.orgMembershipId,
        display: `${member.firstName ?? ""} ${member.lastName ?? ""}`
      }))
    });
  };

  const deleteScimGroup = async ({ groupId, orgId }: TDeleteScimGroupDTO) => {
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

    return {}; // intentionally return empty object upon success
  };

  const fnValidateScimToken = async (token: TScimTokenJwtPayload) => {
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

  return {
    createScimToken,
    listScimTokens,
    deleteScimToken,
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
    updateScimGroupNamePut,
    updateScimGroupNamePatch,
    fnValidateScimToken
  };
};
