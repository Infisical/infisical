import { ForbiddenError } from "@casl/ability";
import slugify from "@sindresorhus/slugify";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import { Knex } from "knex";

import {
  OrgMembershipRole,
  OrgMembershipStatus,
  ProjectMembershipRole,
  ProjectVersion,
  TableName,
  TUsers
} from "@app/db/schemas";
import { TProjects } from "@app/db/schemas/projects";
import { TGroupDALFactory } from "@app/ee/services/group/group-dal";
import { TUserGroupMembershipDALFactory } from "@app/ee/services/group/user-group-membership-dal";
import { TLicenseServiceFactory } from "@app/ee/services/license/license-service";
import { OrgPermissionActions, OrgPermissionSubjects } from "@app/ee/services/permission/org-permission";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service";
import { TProjectUserAdditionalPrivilegeDALFactory } from "@app/ee/services/project-user-additional-privilege/project-user-additional-privilege-dal";
import { TSamlConfigDALFactory } from "@app/ee/services/saml-config/saml-config-dal";
import { getConfig } from "@app/lib/config/env";
import { generateAsymmetricKeyPair } from "@app/lib/crypto";
import { generateSymmetricKey, infisicalSymmetricEncypt } from "@app/lib/crypto/encryption";
import { generateUserSrpKeys } from "@app/lib/crypto/srp";
import { BadRequestError, NotFoundError, UnauthorizedError } from "@app/lib/errors";
import { alphaNumericNanoId } from "@app/lib/nanoid";
import { isDisposableEmail } from "@app/lib/validator";
import { TOrgMembershipDALFactory } from "@app/services/org-membership/org-membership-dal";
import { TUserAliasDALFactory } from "@app/services/user-alias/user-alias-dal";

import { ActorAuthMethod, ActorType, AuthMethod, AuthTokenType } from "../auth/auth-type";
import { TAuthTokenServiceFactory } from "../auth-token/auth-token-service";
import { TokenMetadataType, TokenType, TTokenMetadata } from "../auth-token/auth-token-types";
import { TProjectDALFactory } from "../project/project-dal";
import { verifyProjectVersions } from "../project/project-fns";
import { TProjectBotDALFactory } from "../project-bot/project-bot-dal";
import { TProjectKeyDALFactory } from "../project-key/project-key-dal";
import { TProjectMembershipDALFactory } from "../project-membership/project-membership-dal";
import { addMembersToProject } from "../project-membership/project-membership-fns";
import { TProjectUserMembershipRoleDALFactory } from "../project-membership/project-user-membership-role-dal";
import { SmtpTemplates, TSmtpService } from "../smtp/smtp-service";
import { TUserDALFactory } from "../user/user-dal";
import { TIncidentContactsDALFactory } from "./incident-contacts-dal";
import { TOrgBotDALFactory } from "./org-bot-dal";
import { TOrgDALFactory } from "./org-dal";
import { deleteOrgMembershipFn } from "./org-fns";
import { TOrgRoleDALFactory } from "./org-role-dal";
import {
  TDeleteOrgMembershipDTO,
  TFindAllWorkspacesDTO,
  TFindOrgMembersByEmailDTO,
  TGetOrgGroupsDTO,
  TGetOrgMembershipDTO,
  TInviteUserToOrgDTO,
  TListProjectMembershipsByOrgMembershipIdDTO,
  TUpdateOrgDTO,
  TUpdateOrgMembershipDTO,
  TVerifyUserToOrgDTO
} from "./org-types";

type TOrgServiceFactoryDep = {
  userAliasDAL: Pick<TUserAliasDALFactory, "delete">;
  orgDAL: TOrgDALFactory;
  orgBotDAL: TOrgBotDALFactory;
  orgRoleDAL: TOrgRoleDALFactory;
  userDAL: TUserDALFactory;
  groupDAL: TGroupDALFactory;
  projectDAL: TProjectDALFactory;
  projectMembershipDAL: Pick<
    TProjectMembershipDALFactory,
    "findProjectMembershipsByUserId" | "delete" | "create" | "find" | "insertMany" | "transaction"
  >;
  projectKeyDAL: Pick<TProjectKeyDALFactory, "find" | "delete" | "insertMany" | "findLatestProjectKey">;
  orgMembershipDAL: Pick<TOrgMembershipDALFactory, "findOrgMembershipById" | "findOne">;
  incidentContactDAL: TIncidentContactsDALFactory;
  samlConfigDAL: Pick<TSamlConfigDALFactory, "findOne" | "findEnforceableSamlCfg">;
  smtpService: TSmtpService;
  tokenService: TAuthTokenServiceFactory;
  permissionService: TPermissionServiceFactory;
  licenseService: Pick<
    TLicenseServiceFactory,
    "getPlan" | "updateSubscriptionOrgMemberCount" | "generateOrgCustomerId" | "removeOrgCustomer"
  >;
  projectUserAdditionalPrivilegeDAL: Pick<TProjectUserAdditionalPrivilegeDALFactory, "delete">;
  userGroupMembershipDAL: Pick<TUserGroupMembershipDALFactory, "findUserGroupMembershipsInProject">;
  projectBotDAL: Pick<TProjectBotDALFactory, "findOne">;
  projectUserMembershipRoleDAL: Pick<TProjectUserMembershipRoleDALFactory, "insertMany">;
};

export type TOrgServiceFactory = ReturnType<typeof orgServiceFactory>;

export const orgServiceFactory = ({
  userAliasDAL,
  orgDAL,
  userDAL,
  groupDAL,
  orgRoleDAL,
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
  samlConfigDAL,
  userGroupMembershipDAL,
  projectBotDAL,
  projectUserMembershipRoleDAL
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
    await permissionService.getUserOrgPermission(userId, orgId, actorAuthMethod, actorOrgId);
    const org = await orgDAL.findOrgById(orgId);
    if (!org) throw new BadRequestError({ name: "Org not found", message: "Organization not found" });
    return org;
  };
  /*
   * Get all organization a user part of
   * */
  const findAllOrganizationOfUser = async (userId: string) => {
    const orgs = await orgDAL.findAllOrgsByUserId(userId);
    return orgs;
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
    const { permission } = await permissionService.getUserOrgPermission(userId, orgId, actorAuthMethod, actorOrgId);
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Read, OrgPermissionSubjects.Member);

    const members = await orgDAL.findAllOrgMembers(orgId);
    return members;
  };

  const getOrgGroups = async ({ actor, actorId, orgId, actorAuthMethod, actorOrgId }: TGetOrgGroupsDTO) => {
    const { permission } = await permissionService.getOrgPermission(actor, actorId, orgId, actorAuthMethod, actorOrgId);
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Read, OrgPermissionSubjects.Groups);
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

  const findAllWorkspaces = async ({ actor, actorId, orgId }: TFindAllWorkspacesDTO) => {
    const organizationWorkspaceIds = new Set((await projectDAL.find({ orgId })).map((workspace) => workspace.id));

    let workspaces: (TProjects & { organization: string } & {
      environments: {
        id: string;
        slug: string;
        name: string;
      }[];
    })[];

    if (actor === ActorType.USER) {
      workspaces = await projectDAL.findAllProjects(actorId);
    } else if (actor === ActorType.IDENTITY) {
      workspaces = await projectDAL.findAllProjectsByIdentity(actorId);
    } else {
      throw new BadRequestError({ message: "Invalid actor type" });
    }

    return workspaces.filter((workspace) => organizationWorkspaceIds.has(workspace.id));
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
        protectedKey: encKeys.protectedKey,
        protectedKeyIV: encKeys.protectedKeyIV,
        protectedKeyTag: encKeys.protectedKeyTag,
        publicKey: encKeys.publicKey,
        encryptedPrivateKey: encKeys.encryptedPrivateKey,
        iv: encKeys.encryptedPrivateKeyIV,
        tag: encKeys.encryptedPrivateKeyTag,
        salt: encKeys.salt,
        verifier: encKeys.verifier
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

  /*
   * Update organization details
   * */
  const updateOrg = async ({
    actor,
    actorId,
    actorOrgId,
    actorAuthMethod,
    orgId,
    data: { name, slug, authEnforced, scimEnabled }
  }: TUpdateOrgDTO) => {
    const { permission } = await permissionService.getOrgPermission(actor, actorId, orgId, actorAuthMethod, actorOrgId);
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Edit, OrgPermissionSubjects.Settings);

    const plan = await licenseService.getPlan(orgId);

    if (authEnforced !== undefined) {
      if (!plan?.samlSSO)
        throw new BadRequestError({
          message:
            "Failed to enforce/un-enforce SAML SSO due to plan restriction. Upgrade plan to enforce/un-enforce SAML SSO."
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
    }

    if (authEnforced) {
      const samlCfg = await samlConfigDAL.findEnforceableSamlCfg(orgId);
      if (!samlCfg)
        throw new BadRequestError({
          name: "No enforceable SAML config found",
          message: "No enforceable SAML config found"
        });
    }

    const org = await orgDAL.updateById(orgId, {
      name,
      slug: slug ? slugify(slug) : undefined,
      authEnforced,
      scimEnabled
    });
    if (!org) throw new BadRequestError({ name: "Org not found", message: "Organization not found" });
    return org;
  };
  /*
   * Create organization
   * */
  const createOrganization = async ({
    userId,
    userEmail,
    orgName
  }: {
    userId: string;
    orgName: string;
    userEmail?: string | null;
  }) => {
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

    const customerId = await licenseService.generateOrgCustomerId(orgName, userEmail);
    const organization = await orgDAL.transaction(async (tx) => {
      // akhilmhdh: for now this is auto created. in future we can input from user and for previous users just modifiy
      const org = await orgDAL.create(
        { name: orgName, customerId, slug: slugify(`${orgName}-${alphaNumericNanoId(4)}`) },
        tx
      );
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
    });

    await licenseService.updateSubscriptionOrgMemberCount(organization.id);
    return organization;
  };

  /*
   * Delete organization by id
   * */
  const deleteOrganizationById = async (
    userId: string,
    orgId: string,
    actorAuthMethod: ActorAuthMethod,
    actorOrgId: string | undefined
  ) => {
    const { membership } = await permissionService.getUserOrgPermission(userId, orgId, actorAuthMethod, actorOrgId);
    if ((membership.role as OrgMembershipRole) !== OrgMembershipRole.Admin)
      throw new UnauthorizedError({ name: "Delete org by id", message: "Not an admin" });

    const organization = await orgDAL.deleteById(orgId);
    if (organization.customerId) {
      await licenseService.removeOrgCustomer(organization.customerId);
    }
    return organization;
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
    actorOrgId
  }: TUpdateOrgMembershipDTO) => {
    const { permission } = await permissionService.getUserOrgPermission(userId, orgId, actorAuthMethod, actorOrgId);
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Edit, OrgPermissionSubjects.Member);

    const foundMembership = await orgMembershipDAL.findOne({
      id: membershipId,
      orgId
    });
    if (!foundMembership) throw new NotFoundError({ message: "Failed to find organization membership" });
    if (foundMembership.userId === userId)
      throw new BadRequestError({ message: "Cannot update own organization membership" });

    const isCustomRole = !Object.values(OrgMembershipRole).includes(role as OrgMembershipRole);
    if (role && isCustomRole) {
      const customRole = await orgRoleDAL.findOne({ slug: role, orgId });
      if (!customRole) throw new BadRequestError({ name: "Update membership", message: "Role not found" });

      const plan = await licenseService.getPlan(orgId);
      if (!plan?.rbac)
        throw new BadRequestError({
          message: "Failed to assign custom role due to RBAC restriction. Upgrade plan to assign custom role to member."
        });

      const [membership] = await orgDAL.updateMembership(
        { id: membershipId, orgId },
        {
          role: OrgMembershipRole.Custom,
          roleId: customRole.id
        }
      );
      return membership;
    }

    const [membership] = await orgDAL.updateMembership({ id: membershipId, orgId }, { role, roleId: null, isActive });
    return membership;
  };
  /*
   * Invite user to organization
   */
  const inviteUserToOrganization = async ({
    orgId,
    userId,
    inviteeEmails,
    organizationRoleSlug,
    projectRoleSlug,
    projectIds,
    actorAuthMethod,
    actorOrgId
  }: TInviteUserToOrgDTO) => {
    const appCfg = getConfig();

    const { permission } = await permissionService.getUserOrgPermission(userId, orgId, actorAuthMethod, actorOrgId);
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Create, OrgPermissionSubjects.Member);

    const org = await orgDAL.findOrgById(orgId);

    if (org?.authEnforced) {
      throw new BadRequestError({
        message: "Failed to invite user due to org-level auth enforced for organization"
      });
    }

    const plan = await licenseService.getPlan(orgId);
    if (plan?.memberLimit && plan.membersUsed >= plan.memberLimit) {
      // limit imposed on number of members allowed / number of members used exceeds the number of members allowed
      throw new BadRequestError({
        message: "Failed to invite member due to member limit reached. Upgrade plan to invite more members."
      });
    }

    if (plan?.identityLimit && plan.identitiesUsed >= plan.identityLimit) {
      // limit imposed on number of identities allowed / number of identities used exceeds the number of identities allowed
      throw new BadRequestError({
        message: "Failed to invite member due to member limit reached. Upgrade plan to invite more members."
      });
    }

    if (projectIds?.length) {
      const projects = await projectDAL.find({
        orgId,
        $in: {
          id: projectIds
        }
      });

      // if its not v3, throw an error
      if (!verifyProjectVersions(projects, ProjectVersion.V3)) {
        throw new BadRequestError({
          message: "One or more selected projects are not compatible with this operation. Please upgrade your projects."
        });
      }
    }

    const inviteeUsers = await orgDAL.transaction(async (tx) => {
      const users: Pick<
        TUsers & { orgId: string },
        "id" | "firstName" | "lastName" | "email" | "orgId" | "username"
      >[] = [];
      for await (const inviteeEmail of inviteeEmails) {
        const inviteeUser = await userDAL.findUserByUsername(inviteeEmail, tx);

        if (inviteeUser) {
          // if user already exist means its already part of infisical
          // Thus the signup flow is not needed anymore
          const [inviteeMembership] = await orgDAL.findMembership(
            {
              [`${TableName.OrgMembership}.orgId` as "orgId"]: orgId,
              [`${TableName.OrgMembership}.userId` as "userId"]: inviteeUser.id
            },
            { tx }
          );
          if (inviteeMembership && inviteeMembership.status === OrgMembershipStatus.Accepted) {
            throw new BadRequestError({
              message: `Failed to invite members because ${inviteeEmail} is already part of the organization`,
              name: "Invite user to org"
            });
          }

          if (!inviteeMembership) {
            await orgDAL.createMembership(
              {
                userId: inviteeUser.id,
                inviteEmail: inviteeEmail,
                orgId,
                role: OrgMembershipRole.Member,
                status: OrgMembershipStatus.Invited,
                isActive: true
              },
              tx
            );

            if (projectIds?.length) {
              if (
                organizationRoleSlug === OrgMembershipRole.Custom ||
                projectRoleSlug === ProjectMembershipRole.Custom
              ) {
                throw new BadRequestError({
                  message: "Custom roles are not supported for inviting users to projects and organizations"
                });
              }

              if (!projectRoleSlug) {
                throw new BadRequestError({
                  message: "Selecting a project role is required to invite users to projects"
                });
              }

              await projectMembershipDAL.insertMany(
                projectIds.map((id) => ({ projectId: id, userId: inviteeUser.id })),
                tx
              );
              for await (const projectId of projectIds) {
                await addMembersToProject({
                  orgDAL,
                  projectDAL,
                  projectMembershipDAL,
                  projectKeyDAL,
                  userGroupMembershipDAL,
                  projectBotDAL,
                  projectUserMembershipRoleDAL,
                  smtpService
                }).addMembersToNonE2EEProject(
                  {
                    emails: [inviteeEmail],
                    usernames: [],
                    projectId,
                    projectMembershipRole: projectRoleSlug,
                    sendEmails: false
                  },
                  {
                    tx
                  }
                );
              }
            }
          }
          return [{ ...inviteeUser, orgId }];
        }
        const isEmailInvalid = await isDisposableEmail(inviteeEmail);
        if (isEmailInvalid) {
          throw new BadRequestError({
            message: "Provided a disposable email",
            name: "Org invite"
          });
        }
        // not invited before
        const user = await userDAL.create(
          {
            username: inviteeEmail,
            email: inviteeEmail,
            isAccepted: false,
            authMethods: [AuthMethod.EMAIL],
            isGhost: false
          },
          tx
        );
        await orgDAL.createMembership(
          {
            inviteEmail: inviteeEmail,
            orgId,
            userId: user.id,
            role: organizationRoleSlug,
            status: OrgMembershipStatus.Invited,
            isActive: true
          },
          tx
        );

        users.push({
          ...user,
          orgId
        });
      }
      return users;
    });

    const user = await userDAL.findById(userId);

    const signupTokens: { email: string; link: string }[] = [];
    if (inviteeUsers) {
      for await (const invitee of inviteeUsers) {
        const token = await tokenService.createTokenForUser({
          type: TokenType.TOKEN_EMAIL_ORG_INVITATION,
          userId: invitee.id,
          orgId
        });

        let inviteMetadata: string = "";
        if (projectIds && projectIds?.length > 0) {
          inviteMetadata = jwt.sign(
            {
              type: TokenMetadataType.InviteToProjects,
              payload: {
                projectIds,
                projectRoleSlug: projectRoleSlug!, // Implicitly checked inside transaction if projectRoleSlug is undefined
                userId: invitee.id,
                orgId
              }
            } satisfies TTokenMetadata,
            appCfg.AUTH_SECRET,
            {
              expiresIn: appCfg.JWT_INVITE_LIFETIME
            }
          );
        }

        signupTokens.push({
          email: invitee.email || invitee.username,
          link: `${appCfg.SITE_URL}/signupinvite?token=${token}${
            inviteMetadata ? `&metadata=${inviteMetadata}` : ""
          }&to=${invitee.email || invitee.username}&organization_id=${org?.id}`
        });

        await smtpService.sendMail({
          template: SmtpTemplates.OrgInvite,
          subjectLine: "Infisical organization invitation",
          recipients: [invitee.email || invitee.username],
          substitutions: {
            metadata: inviteMetadata,
            inviterFirstName: user.firstName,
            inviterUsername: user.username,
            organizationName: org?.name,
            email: invitee.email || invitee.username,
            organizationId: org?.id.toString(),
            token,
            callback_url: `${appCfg.SITE_URL}/signupinvite`
          }
        });
      }
    }
    await licenseService.updateSubscriptionOrgMemberCount(orgId);

    if (!appCfg.isSmtpConfigured) {
      return signupTokens;
    }
  };

  /**
   * Organization invitation step 2: Verify that code [code] was sent to email [email] as part of
   * magic link and issue a temporary signup token for user to complete setting up their account
   */
  const verifyUserToOrg = async ({ orgId, email, code }: TVerifyUserToOrgDTO) => {
    const user = await userDAL.findUserByUsername(email);
    if (!user) {
      throw new BadRequestError({ message: "Invalid request", name: "Verify user to org" });
    }
    const [orgMembership] = await orgDAL.findMembership({
      [`${TableName.OrgMembership}.userId` as "userId"]: user.id,
      status: OrgMembershipStatus.Invited,
      [`${TableName.OrgMembership}.orgId` as "orgId"]: orgId
    });
    if (!orgMembership)
      throw new BadRequestError({
        message: "Failed to find invitation",
        name: "Verify user to org"
      });

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

    const appCfg = getConfig();
    const token = jwt.sign(
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
    if (!membership) throw new NotFoundError({ message: "Failed to find organization membership" });
    if (membership.orgId !== orgId) throw new NotFoundError({ message: "Failed to find organization membership" });

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
      licenseService
    });

    return deletedMembership;
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
    if (!membership) throw new NotFoundError({ message: "Failed to find organization membership" });
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

  return {
    findOrganizationById,
    findAllOrgMembers,
    findAllOrganizationOfUser,
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
    listProjectMembershipsByOrgMembershipId
  };
};
