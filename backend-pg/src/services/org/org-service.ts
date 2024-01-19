import { ForbiddenError } from "@casl/ability";
import jwt from "jsonwebtoken";

import { OrgMembershipRole, OrgMembershipStatus } from "@app/db/schemas";
import { TLicenseServiceFactory } from "@app/ee/services/license/license-service";
import {
  OrgPermissionActions,
  OrgPermissionSubjects
} from "@app/ee/services/permission/org-permission";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service";
import { TSamlConfigDALFactory } from "@app/ee/services/saml-config/saml-config-dal";
import { getConfig } from "@app/lib/config/env";
import { generateAsymmetricKeyPair } from "@app/lib/crypto";
import { generateSymmetricKey, infisicalSymmetricEncypt } from "@app/lib/crypto/encryption";
import { BadRequestError, UnauthorizedError } from "@app/lib/errors";
import { isDisposableEmail } from "@app/lib/validator";

import { AuthMethod, AuthTokenType } from "../auth/auth-type";
import { TAuthTokenServiceFactory } from "../auth-token/auth-token-service";
import { TokenType } from "../auth-token/auth-token-types";
import { SmtpTemplates, TSmtpService } from "../smtp/smtp-service";
import { TUserDALFactory } from "../user/user-dal";
import { TIncidentContactsDALFactory } from "./incident-contacts-dal";
import { TOrgBotDALFactory } from "./org-bot-dal";
import { TOrgDALFactory } from "./org-dal";
import { TOrgRoleDALFactory } from "./org-role-dal";
import {
  TDeleteOrgMembershipDTO,
  TInviteUserToOrgDTO,
  TUpdateOrgMembershipDTO,
  TVerifyUserToOrgDTO
} from "./org-types";

type TOrgServiceFactoryDep = {
  orgDAL: TOrgDALFactory;
  orgBotDAL: TOrgBotDALFactory;
  orgRoleDAL: TOrgRoleDALFactory;
  userDAL: TUserDALFactory;
  incidentContactDAL: TIncidentContactsDALFactory;
  samlConfigDAL: Pick<TSamlConfigDALFactory, "findOne">;
  smtpService: TSmtpService;
  tokenService: TAuthTokenServiceFactory;
  permissionService: TPermissionServiceFactory;
  licenseService: Pick<
    TLicenseServiceFactory,
    "getPlan" | "updateSubscriptionOrgMemberCount" | "generateOrgCustomerId" | "removeOrgCustomer"
  >;
};

export type TOrgServiceFactory = ReturnType<typeof orgServiceFactory>;

export const orgServiceFactory = ({
  orgDAL,
  userDAL,
  orgRoleDAL,
  incidentContactDAL,
  permissionService,
  smtpService,
  tokenService,
  orgBotDAL,
  licenseService,
  samlConfigDAL
}: TOrgServiceFactoryDep) => {
  /*
   * Get organization details by the organization id
   * */
  const findOrganizationById = async (userId: string, orgId: string) => {
    await permissionService.getUserOrgPermission(userId, orgId);
    const org = await orgDAL.findOrgById(orgId);
    if (!org)
      throw new BadRequestError({ name: "Org not found", message: "Organization not found" });
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
  const findAllOrgMembers = async (userId: string, orgId: string) => {
    const { permission } = await permissionService.getUserOrgPermission(userId, orgId);
    ForbiddenError.from(permission).throwUnlessCan(
      OrgPermissionActions.Read,
      OrgPermissionSubjects.Member
    );

    const members = await orgDAL.findAllOrgMembers(orgId);
    return members;
  };
  /*
   * Update organization settings
   * */
  const updateOrgName = async (userId: string, orgId: string, name: string) => {
    const { permission } = await permissionService.getUserOrgPermission(userId, orgId);
    ForbiddenError.from(permission).throwUnlessCan(
      OrgPermissionActions.Edit,
      OrgPermissionSubjects.Settings
    );
    const org = await orgDAL.updateById(orgId, { name });
    if (!org)
      throw new BadRequestError({ name: "Org not found", message: "Organization not found" });
    return org;
  };
  /*
   * Create organization
   * */
  const createOrganization = async (userId: string, userEmail: string, orgName: string) => {
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
      const org = await orgDAL.create({ name: orgName, customerId }, tx);
      await orgDAL.createMembership(
        {
          userId,
          orgId: org.id,
          role: OrgMembershipRole.Admin,
          status: OrgMembershipStatus.Accepted
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

    return organization;
  };

  /*
   * Delete organization by id
   * */
  const deleteOrganizationById = async (userId: string, orgId: string) => {
    const { membership } = await permissionService.getUserOrgPermission(userId, orgId);
    if (membership.role !== OrgMembershipRole.Admin)
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
    orgId,
    userId,
    membershipId
  }: TUpdateOrgMembershipDTO) => {
    const { permission } = await permissionService.getUserOrgPermission(userId, orgId);
    ForbiddenError.from(permission).throwUnlessCan(
      OrgPermissionActions.Edit,
      OrgPermissionSubjects.Member
    );

    const isCustomRole = !Object.values(OrgMembershipRole).includes(role as OrgMembershipRole);
    if (isCustomRole) {
      const customRole = await orgRoleDAL.findOne({ slug: role, orgId });
      if (!customRole)
        throw new BadRequestError({ name: "Update membership", message: "Role not found" });

      const plan = await licenseService.getPlan(orgId);
      if (!plan?.rbac)
        throw new BadRequestError({
          message:
            "Failed to assign custom role due to RBAC restriction. Upgrade plan to assign custom role to member."
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

    const [membership] = await orgDAL.updateMembership(
      { id: membershipId, orgId },
      { role, roleId: null }
    );
    return membership;
  };
  /*
   * Invite user to organization
   */
  const inviteUserToOrganization = async ({ orgId, userId, inviteeEmail }: TInviteUserToOrgDTO) => {
    const { permission } = await permissionService.getUserOrgPermission(userId, orgId);
    ForbiddenError.from(permission).throwUnlessCan(
      OrgPermissionActions.Create,
      OrgPermissionSubjects.Member
    );

    const samlCfg = await samlConfigDAL.findOne({ orgId });
    if (samlCfg && samlCfg.isActive) {
      throw new BadRequestError({
        message: "Failed to invite member due to SAML SSO configured for organization"
      });
    }
    const plan = await licenseService.getPlan(orgId);
    if (plan.memberLimit !== null && plan.membersUsed >= plan.memberLimit) {
      // case: limit imposed on number of members allowed
      // case: number of members used exceeds the number of members allowed
      throw new BadRequestError({
        message:
          "Failed to invite member due to member limit reached. Upgrade plan to invite more members."
      });
    }
    const invitee = await orgDAL.transaction(async (tx) => {
      const inviteeUser = await userDAL.findUserByEmail(inviteeEmail, tx);
      if (inviteeUser) {
        // if user already exist means its already part of infisical
        // Thus the signup flow is not needed anymore
        const [inviteeMembership] = await orgDAL.findMembership(
          { orgId, userId: inviteeUser.id },
          { tx }
        );
        if (inviteeMembership && inviteeMembership.status === OrgMembershipStatus.Accepted) {
          throw new BadRequestError({
            message: "Failed to invite an existing member of org",
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
              status: OrgMembershipStatus.Invited
            },
            tx
          );
        }
        return inviteeUser;
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
          email: inviteeEmail,
          isAccepted: false,
          authMethods: [AuthMethod.EMAIL]
        },
        tx
      );
      await orgDAL.createMembership(
        {
          inviteEmail: inviteeEmail,
          orgId,
          userId: user.id,
          role: OrgMembershipRole.Member,
          status: OrgMembershipStatus.Invited
        },
        tx
      );
      return user;
    });

    const token = await tokenService.createTokenForUser({
      type: TokenType.TOKEN_EMAIL_ORG_INVITATION,
      userId: invitee.id,
      orgId
    });

    const org = await orgDAL.findOrgById(orgId);
    const user = await userDAL.findById(userId);
    const appCfg = getConfig();
    await smtpService.sendMail({
      template: SmtpTemplates.OrgInvite,
      subjectLine: "Infisical organization invitation",
      recipients: [inviteeEmail],
      substitutions: {
        inviterFirstName: user.firstName,
        inviterEmail: user.email,
        organizationName: org?.name,
        email: inviteeEmail,
        organizationId: org?.id.toString(),
        token,
        callback_url: `${appCfg.SITE_URL}/signupinvite`
      }
    });

    await licenseService.updateSubscriptionOrgMemberCount(orgId);
    if (!appCfg.isSmtpConfigured) {
      return `${appCfg.SITE_URL}/signupinvite?token=${token}&to=${inviteeEmail}&organization_id=${org?.id}`;
    }
  };

  /**
   * Organization invitation step 2: Verify that code [code] was sent to email [email] as part of
   * magic link and issue a temporary signup token for user to complete setting up their account
   */
  const verifyUserToOrg = async ({ orgId, email, code }: TVerifyUserToOrgDTO) => {
    const user = await userDAL.findUserByEmail(email);
    if (!user) {
      throw new BadRequestError({ message: "Invalid request", name: "Verify user to org" });
    }
    const [orgMembership] = await orgDAL.findMembership({
      userId: user.id,
      status: OrgMembershipStatus.Invited,
      orgId
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
      appCfg.JWT_AUTH_SECRET,
      {
        expiresIn: appCfg.JWT_SIGNUP_LIFETIME
      }
    );

    return { token, user };
  };

  const deleteOrgMembership = async ({ orgId, userId, membershipId }: TDeleteOrgMembershipDTO) => {
    const { permission } = await permissionService.getUserOrgPermission(userId, orgId);
    ForbiddenError.from(permission).throwUnlessCan(
      OrgPermissionActions.Delete,
      OrgPermissionSubjects.Member
    );

    const membership = await orgDAL.deleteMembershipById(membershipId, orgId);

    await licenseService.updateSubscriptionOrgMemberCount(orgId);
    return membership;
  };

  /*
   * CRUD operations of incident contacts
   * */
  const findIncidentContacts = async (userId: string, orgId: string) => {
    const { permission } = await permissionService.getUserOrgPermission(userId, orgId);
    ForbiddenError.from(permission).throwUnlessCan(
      OrgPermissionActions.Read,
      OrgPermissionSubjects.IncidentAccount
    );
    const incidentContacts = await incidentContactDAL.findByOrgId(orgId);
    return incidentContacts;
  };

  const createIncidentContact = async (userId: string, orgId: string, email: string) => {
    const { permission } = await permissionService.getUserOrgPermission(userId, orgId);
    ForbiddenError.from(permission).throwUnlessCan(
      OrgPermissionActions.Create,
      OrgPermissionSubjects.IncidentAccount
    );
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

  const deleteIncidentContact = async (userId: string, orgId: string, id: string) => {
    const { permission } = await permissionService.getUserOrgPermission(userId, orgId);
    ForbiddenError.from(permission).throwUnlessCan(
      OrgPermissionActions.Delete,
      OrgPermissionSubjects.IncidentAccount
    );

    const incidentContact = await incidentContactDAL.deleteById(id, orgId);
    return incidentContact;
  };

  return {
    findOrganizationById,
    findAllOrgMembers,
    findAllOrganizationOfUser,
    inviteUserToOrganization,
    verifyUserToOrg,
    updateOrgName,
    createOrganization,
    deleteOrganizationById,
    deleteOrgMembership,
    updateOrgMembership,
    // incident contacts
    findIncidentContacts,
    createIncidentContact,
    deleteIncidentContact
  };
};
