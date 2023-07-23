import { Types } from "mongoose";
import { Request, Response } from "express";
import { MembershipOrg, Organization, User } from "../../models";
import { SSOConfig } from "../../ee/models";
import { deleteMembershipOrg as deleteMemberFromOrg } from "../../helpers/membershipOrg";
import { createToken } from "../../helpers/auth";
import { updateSubscriptionOrgQuantity } from "../../helpers/organization";
import { sendMail } from "../../helpers/nodemailer";
import { TokenService } from "../../services";
import { EELicenseService } from "../../ee/services";
import {
  ACCEPTED,
  ADMIN,
  INVITED,
  MEMBER,
  OWNER,
  TOKEN_EMAIL_ORG_INVITATION
} from "../../variables";
import {
  getJwtSignupLifetime,
  getJwtSignupSecret,
  getSiteURL,
  getSmtpConfigured
} from "../../config";
import { validateUserEmail } from "../../validation";

/**
 * Delete organization membership with id [membershipOrgId] from organization
 * @param req
 * @param res
 * @returns
 */
export const deleteMembershipOrg = async (req: Request, _res: Response) => {
  const { membershipOrgId } = req.params;

  // check if organization membership to delete exists
  const membershipOrgToDelete = await MembershipOrg.findOne({
    _id: membershipOrgId
  }).populate("user");

  if (!membershipOrgToDelete) {
    throw new Error("Failed to delete organization membership that doesn't exist");
  }

  // check if user is a member and admin of the organization
  // whose membership we wish to delete
  const membershipOrg = await MembershipOrg.findOne({
    user: req.user._id,
    organization: membershipOrgToDelete.organization
  });

  if (!membershipOrg) {
    throw new Error("Failed to validate organization membership");
  }

  if (membershipOrg.role !== OWNER && membershipOrg.role !== ADMIN) {
    // user is not an admin member of the organization
    throw new Error("Insufficient role for deleting organization membership");
  }

  // delete organization membership
  await deleteMemberFromOrg({
    membershipOrgId: membershipOrgToDelete._id.toString()
  });

  await updateSubscriptionOrgQuantity({
    organizationId: membershipOrg.organization.toString()
  });

  return membershipOrgToDelete;
};

/**
 * Change and return organization membership role
 * @param req
 * @param res
 * @returns
 */
export const changeMembershipOrgRole = async (req: Request, res: Response) => {
  // change role for (target) organization membership with id
  // [membershipOrgId]

  let membershipToChangeRole;

  return res.status(200).send({
    membershipOrg: membershipToChangeRole
  });
};

/**
 * Organization invitation step 1: Send email invitation to user with email [email]
 * for organization with id [organizationId] containing magic link
 * @param req
 * @param res
 * @returns
 */
export const inviteUserToOrganization = async (req: Request, res: Response) => {
  let inviteeMembershipOrg, completeInviteLink;
  const { organizationId, inviteeEmail } = req.body;
  const host = req.headers.host;
  const siteUrl = `${req.protocol}://${host}`;

  // validate membership
  const membershipOrg = await MembershipOrg.findOne({
    user: req.user._id,
    organization: organizationId
  });

  if (!membershipOrg) {
    throw new Error("Failed to validate organization membership");
  }

  const plan = await EELicenseService.getPlan(organizationId);
  
  const ssoConfig = await SSOConfig.findOne({
    organization: new Types.ObjectId(organizationId)
  });

  if (ssoConfig && ssoConfig.isActive) {
    // case: SAML SSO is enabled for the organization
    return res.status(400).send({
      message:
        "Failed to invite member due to SAML SSO configured for organization"
    }); 
  }

  if (plan.memberLimit !== null) {
    // case: limit imposed on number of members allowed

    if (plan.membersUsed >= plan.memberLimit) {
      // case: number of members used exceeds the number of members allowed
      return res.status(400).send({
        message:
          "Failed to invite member due to member limit reached. Upgrade plan to invite more members."
      });
    }
  }

  const invitee = await User.findOne({
    email: inviteeEmail
  }).select("+publicKey");

  if (invitee) {
    // case: invitee is an existing user

    inviteeMembershipOrg = await MembershipOrg.findOne({
      user: invitee._id,
      organization: organizationId
    });

    if (inviteeMembershipOrg && inviteeMembershipOrg.status === ACCEPTED) {
      throw new Error("Failed to invite an existing member of the organization");
    }

    if (!inviteeMembershipOrg) {
      await new MembershipOrg({
        user: invitee,
        inviteEmail: inviteeEmail,
        organization: organizationId,
        role: MEMBER,
        status: INVITED
      }).save();
    }
  } else {
    // check if invitee has been invited before
    inviteeMembershipOrg = await MembershipOrg.findOne({
      inviteEmail: inviteeEmail,
      organization: organizationId
    });

    if (!inviteeMembershipOrg) {
      // case: invitee has never been invited before

      // validate that email is not disposable
      validateUserEmail(inviteeEmail);

      await new MembershipOrg({
        inviteEmail: inviteeEmail,
        organization: organizationId,
        role: MEMBER,
        status: INVITED
      }).save();
    }
  }

  const organization = await Organization.findOne({ _id: organizationId });

  if (organization) {
    const token = await TokenService.createToken({
      type: TOKEN_EMAIL_ORG_INVITATION,
      email: inviteeEmail,
      organizationId: organization._id
    });

    await sendMail({
      template: "organizationInvitation.handlebars",
      subjectLine: "Infisical organization invitation",
      recipients: [inviteeEmail],
      substitutions: {
        inviterFirstName: req.user.firstName,
        inviterEmail: req.user.email,
        organizationName: organization.name,
        email: inviteeEmail,
        organizationId: organization._id.toString(),
        token,
        callback_url: (await getSiteURL()) + "/signupinvite"
      }
    });

    if (!(await getSmtpConfigured())) {
      completeInviteLink = `${
        siteUrl + "/signupinvite"
      }?token=${token}&to=${inviteeEmail}&organization_id=${organization._id}`;
    }
  }

  await updateSubscriptionOrgQuantity({ organizationId });

  return res.status(200).send({
    message: `Sent an invite link to ${req.body.inviteeEmail}`,
    completeInviteLink
  });
};

/**
 * Organization invitation step 2: Verify that code [code] was sent to email [email] as part of
 * magic link and issue a temporary signup token for user to complete setting up their account
 * @param req
 * @param res
 * @returns
 */
export const verifyUserToOrganization = async (req: Request, res: Response) => {
  let user;
  const { email, organizationId, code } = req.body;

  user = await User.findOne({ email }).select("+publicKey");

  const membershipOrg = await MembershipOrg.findOne({
    inviteEmail: email,
    status: INVITED,
    organization: new Types.ObjectId(organizationId)
  });

  if (!membershipOrg) throw new Error("Failed to find any invitations for email");

  await TokenService.validateToken({
    type: TOKEN_EMAIL_ORG_INVITATION,
    email,
    organizationId: membershipOrg.organization,
    token: code
  });

  if (user && user?.publicKey) {
    // case: user has already completed account
    // membership can be approved and redirected to login/dashboard
    membershipOrg.status = ACCEPTED;
    await membershipOrg.save();

    await updateSubscriptionOrgQuantity({
      organizationId
    });

    return res.status(200).send({
      message: "Successfully verified email",
      user
    });
  }

  if (!user) {
    // initialize user account
    user = await new User({
      email
    }).save();
  }

  // generate temporary signup token
  const token = createToken({
    payload: {
      userId: user._id.toString()
    },
    expiresIn: await getJwtSignupLifetime(),
    secret: await getJwtSignupSecret()
  });

  return res.status(200).send({
    message: "Successfully verified email",
    user,
    token
  });
};
