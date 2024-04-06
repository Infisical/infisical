import { ForbiddenError } from "@casl/ability";
import slugify from "@sindresorhus/slugify";
import jwt from "jsonwebtoken";

import { OrgMembershipRole, OrgMembershipStatus, TableName, TGroups } from "@app/db/schemas";
import { TGroupDALFactory } from "@app/ee/services/group/group-dal";
import { TScimDALFactory } from "@app/ee/services/scim/scim-dal";
import { getConfig } from "@app/lib/config/env";
import { BadRequestError, ScimRequestError, UnauthorizedError } from "@app/lib/errors";
import { alphaNumericNanoId } from "@app/lib/nanoid";
import { TOrgPermission } from "@app/lib/types";
import { AuthMethod, AuthTokenType } from "@app/services/auth/auth-type";
import { TOrgDALFactory } from "@app/services/org/org-dal";
import { deleteOrgMembership } from "@app/services/org/org-fns";
import { TProjectDALFactory } from "@app/services/project/project-dal";
import { TProjectMembershipDALFactory } from "@app/services/project-membership/project-membership-dal";
import { SmtpTemplates, TSmtpService } from "@app/services/smtp/smtp-service";
import { TUserDALFactory } from "@app/services/user/user-dal";

import { TLicenseServiceFactory } from "../license/license-service";
import { OrgPermissionActions, OrgPermissionSubjects } from "../permission/org-permission";
import { TPermissionServiceFactory } from "../permission/permission-service";
import { buildScimGroup, buildScimGroupList, buildScimUser, buildScimUserList } from "./scim-fns";
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
  TScimTokenJwtPayload,
  TUpdateScimGroupNamePatchDTO,
  TUpdateScimGroupNamePutDTO,
  TUpdateScimUserDTO
} from "./scim-types";

type TScimServiceFactoryDep = {
  scimDAL: Pick<TScimDALFactory, "create" | "find" | "findById" | "deleteById">;
  userDAL: Pick<TUserDALFactory, "findOne" | "create" | "transaction">;
  orgDAL: Pick<
    TOrgDALFactory,
    "createMembership" | "findById" | "findMembership" | "deleteMembershipById" | "transaction"
  >;
  projectDAL: Pick<TProjectDALFactory, "find">;
  projectMembershipDAL: Pick<TProjectMembershipDALFactory, "find" | "delete">;
  groupDAL: Pick<TGroupDALFactory, "create" | "findOne" | "findAllGroupMembers" | "update" | "delete" | "findGroups">;
  licenseService: Pick<TLicenseServiceFactory, "getPlan">;
  permissionService: Pick<TPermissionServiceFactory, "getOrgPermission">;
  smtpService: TSmtpService;
};

export type TScimServiceFactory = ReturnType<typeof scimServiceFactory>;

export const scimServiceFactory = ({
  licenseService,
  scimDAL,
  userDAL,
  orgDAL,
  projectDAL,
  projectMembershipDAL,
  groupDAL,
  permissionService,
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
  const listScimUsers = async ({ offset, limit, filter, orgId }: TListScimUsersDTO): Promise<TListScimUsers> => {
    const org = await orgDAL.findById(orgId);

    if (!org.scimEnabled)
      throw new ScimRequestError({
        detail: "SCIM is disabled for the organization",
        status: 403
      });

    const parseFilter = (filterToParse: string | undefined) => {
      if (!filterToParse) return {};
      const [parsedName, parsedValue] = filterToParse.split("eq").map((s) => s.trim());

      let attributeName = parsedName;
      if (parsedName === "userName") {
        attributeName = "email";
      }

      return { [attributeName]: parsedValue };
    };

    const findOpts = {
      ...(offset && { offset }),
      ...(limit && { limit })
    };

    const users = await orgDAL.findMembership(
      {
        [`${TableName.OrgMembership}.orgId` as "id"]: orgId,
        ...parseFilter(filter)
      },
      findOpts
    );

    const scimUsers = users.map(({ userId, username, firstName, lastName, email }) =>
      buildScimUser({
        userId: userId ?? "",
        username,
        firstName: firstName ?? "",
        lastName: lastName ?? "",
        email,
        active: true
      })
    );

    return buildScimUserList({
      scimUsers,
      offset,
      limit
    });
  };

  const getScimUser = async ({ userId, orgId }: TGetScimUserDTO) => {
    const [membership] = await orgDAL
      .findMembership({
        userId,
        [`${TableName.OrgMembership}.orgId` as "id"]: orgId
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

    return buildScimUser({
      userId: membership.userId as string,
      username: membership.username,
      email: membership.email ?? "",
      firstName: membership.firstName as string,
      lastName: membership.lastName as string,
      active: true
    });
  };

  const createScimUser = async ({ username, email, firstName, lastName, orgId }: TCreateScimUserDTO) => {
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

    let user = await userDAL.findOne({
      username
    });

    if (user) {
      await userDAL.transaction(async (tx) => {
        const [orgMembership] = await orgDAL.findMembership(
          {
            userId: user.id,
            [`${TableName.OrgMembership}.orgId` as "id"]: orgId
          },
          { tx }
        );
        if (orgMembership)
          throw new ScimRequestError({
            detail: "User already exists in the database",
            status: 409
          });

        if (!orgMembership) {
          await orgDAL.createMembership(
            {
              userId: user.id,
              orgId,
              inviteEmail: email,
              role: OrgMembershipRole.Member,
              status: OrgMembershipStatus.Invited
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

        await orgDAL.createMembership(
          {
            inviteEmail: email,
            orgId,
            userId: newUser.id,
            role: OrgMembershipRole.Member,
            status: OrgMembershipStatus.Invited
          },
          tx
        );
        return newUser;
      });
    }

    const appCfg = getConfig();

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
      userId: user.id,
      username: user.username,
      firstName: user.firstName as string,
      lastName: user.lastName as string,
      email: user.email ?? "",
      active: true
    });
  };

  const updateScimUser = async ({ userId, orgId, operations }: TUpdateScimUserDTO) => {
    const [membership] = await orgDAL
      .findMembership({
        userId,
        [`${TableName.OrgMembership}.orgId` as "id"]: orgId
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
      await deleteOrgMembership({
        orgMembershipId: membership.id,
        orgId: membership.orgId,
        orgDAL,
        projectDAL,
        projectMembershipDAL
      });
    }

    return buildScimUser({
      userId: membership.userId as string,
      username: membership.username,
      email: membership.email,
      firstName: membership.firstName as string,
      lastName: membership.lastName as string,
      active
    });
  };

  const replaceScimUser = async ({ userId, active, orgId }: TReplaceScimUserDTO) => {
    const [membership] = await orgDAL
      .findMembership({
        userId,
        [`${TableName.OrgMembership}.orgId` as "id"]: orgId
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

    if (!active) {
      // tx
      await deleteOrgMembership({
        orgMembershipId: membership.id,
        orgId: membership.orgId,
        orgDAL,
        projectDAL,
        projectMembershipDAL
      });
    }

    return buildScimUser({
      userId: membership.userId as string,
      username: membership.username,
      email: membership.email,
      firstName: membership.firstName as string,
      lastName: membership.lastName as string,
      active
    });
  };

  const deleteScimUser = async ({ userId, orgId }: TDeleteScimUserDTO) => {
    const [membership] = await orgDAL
      .findMembership({
        userId,
        [`${TableName.OrgMembership}.orgId` as "id"]: orgId
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

    if (!membership.scimEnabled) {
      throw new ScimRequestError({
        detail: "SCIM is disabled for the organization",
        status: 403
      });
    }

    await deleteOrgMembership({
      orgMembershipId: membership.id,
      orgId: membership.orgId,
      orgDAL,
      projectDAL,
      projectMembershipDAL
    });

    return {}; // intentionally return empty object upon success
  };

  const listScimGroups = async ({ orgId, offset, limit }: TListScimGroupsDTO) => {
    const org = await orgDAL.findById(orgId);

    if (!org.scimEnabled)
      throw new ScimRequestError({
        detail: "SCIM is disabled for the organization",
        status: 403
      });

    const groups = await groupDAL.findGroups({
      orgId
    });

    const scimGroups = groups.map((group) =>
      buildScimGroup({
        groupId: group.id,
        name: group.name,
        members: []
      })
    );

    return buildScimGroupList({
      scimGroups,
      offset,
      limit
    });
  };

  const createScimGroup = async ({ displayName, orgId }: TCreateScimGroupDTO) => {
    const org = await orgDAL.findById(orgId);

    if (!org.scimEnabled)
      throw new ScimRequestError({
        detail: "SCIM is disabled for the organization",
        status: 403
      });

    const group = await groupDAL.create({
      name: displayName,
      slug: slugify(`${displayName}-${alphaNumericNanoId(4)}`),
      orgId,
      role: OrgMembershipRole.NoAccess
    });

    return buildScimGroup({
      groupId: group.id,
      name: group.name,
      members: []
    });
  };

  const getScimGroup = async ({ groupId, orgId }: TGetScimGroupDTO) => {
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

    const users = await groupDAL.findAllGroupMembers(group.orgId, group.id);

    return buildScimGroup({
      groupId: group.id,
      name: group.name,
      members: users
        .filter((user) => user.isPartOfGroup)
        .map((user) => ({
          value: user.id,
          display: `${user.firstName} ${user.lastName}`
        }))
    });
  };

  const updateScimGroupNamePut = async ({ groupId, orgId, displayName }: TUpdateScimGroupNamePutDTO) => {
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

    return buildScimGroup({
      groupId: group.id,
      name: group.name,
      members: []
    });
  };

  // TODO: add support for add/remove op
  const updateScimGroupNamePatch = async ({ groupId, orgId, operations }: TUpdateScimGroupNamePatchDTO) => {
    const org = await orgDAL.findById(orgId);

    if (!org.scimEnabled)
      throw new ScimRequestError({
        detail: "SCIM is disabled for the organization",
        status: 403
      });

    let group: TGroups | undefined;
    for await (const operation of operations) {
      switch (operation.op) {
        case "replace": {
          await groupDAL.update(
            {
              id: groupId,
              orgId
            },
            {
              name: operation.value.displayName
            }
          );
          break;
        }
        case "add": {
          // TODO
          break;
        }
        case "remove": {
          // TODO
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

    if (!group) {
      throw new ScimRequestError({
        detail: "Group Not Found",
        status: 404
      });
    }

    return buildScimGroup({
      groupId: group.id,
      name: group.name,
      members: []
    });
  };

  const deleteScimGroup = async ({ groupId, orgId }: TDeleteScimGroupDTO) => {
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
