import { Request, Response } from 'express';
import * as Sentry from '@sentry/node';
import { SITE_URL, JWT_SIGNUP_LIFETIME, JWT_SIGNUP_SECRET } from '../../config';
import { MembershipOrg, Organization, User } from '../../models';
import { deleteMembershipOrg as deleteMemberFromOrg } from '../../helpers/membershipOrg';
import { createToken } from '../../helpers/auth';
import { updateSubscriptionOrgQuantity } from '../../helpers/organization';
import { sendMail } from '../../helpers/nodemailer';
import { TokenService } from '../../services';
import { OWNER, ADMIN, MEMBER, ACCEPTED, INVITED, TOKEN_EMAIL_ORG_INVITATION } from '../../variables';

/**
 * Delete organization membership with id [membershipOrgId] from organization
 * @param req
 * @param res
 * @returns
 */
export const deleteMembershipOrg = async (req: Request, res: Response) => {
	let membershipOrgToDelete;
	try {
		const { membershipOrgId } = req.params;

		// check if organization membership to delete exists
		membershipOrgToDelete = await MembershipOrg.findOne({
			_id: membershipOrgId
		}).populate('user');

		if (!membershipOrgToDelete) {
			throw new Error(
				"Failed to delete organization membership that doesn't exist"
			);
		}

		// check if user is a member and admin of the organization
		// whose membership we wish to delete
		const membershipOrg = await MembershipOrg.findOne({
			user: req.user._id,
			organization: membershipOrgToDelete.organization
		});

		if (!membershipOrg) {
			throw new Error('Failed to validate organization membership');
		}

		if (membershipOrg.role !== OWNER && membershipOrg.role !== ADMIN) {
			// user is not an admin member of the organization
			throw new Error('Insufficient role for deleting organization membership');
		}

		// delete organization membership
		const deletedMembershipOrg = await deleteMemberFromOrg({
			membershipOrgId: membershipOrgToDelete._id.toString()
		});

		await updateSubscriptionOrgQuantity({
			organizationId: membershipOrg.organization.toString()
		});
	} catch (err) {
		Sentry.setUser({ email: req.user.email });
		Sentry.captureException(err);
		return res.status(400).send({
			message: 'Failed to delete organization membership'
		});
	}

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
	// try {
	// } catch (err) {
	// 	Sentry.setUser({ email: req.user.email });
	// 	Sentry.captureException(err);
	// 	return res.status(400).send({
	// 		message: 'Failed to change organization membership role'
	// 	});
	// }

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
	let invitee, inviteeMembershipOrg;
	try {
		const { organizationId, inviteeEmail } = req.body;

		// validate membership
		const membershipOrg = await MembershipOrg.findOne({
			user: req.user._id,
			organization: organizationId
		});

		if (!membershipOrg) {
			throw new Error('Failed to validate organization membership');
		}
		
		invitee = await User.findOne({
			email: inviteeEmail
		}).select('+publicKey');

		if (invitee) {
			// case: invitee is an existing user
			
			inviteeMembershipOrg = await MembershipOrg.findOne({
				user: invitee._id,
				organization: organizationId
			});

			if (inviteeMembershipOrg && inviteeMembershipOrg.status === ACCEPTED) {
				throw new Error(
					'Failed to invite an existing member of the organization'
				);
			}

			if (!inviteeMembershipOrg) {
				await new MembershipOrg({
					user: invitee,
					inviteEmail: inviteeEmail,
					organization: organizationId,
					role: MEMBER,
					status: invitee?.publicKey ? ACCEPTED : INVITED
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
				template: 'organizationInvitation.handlebars',
				subjectLine: 'Infisical organization invitation',
				recipients: [inviteeEmail],
				substitutions: {
					inviterFirstName: req.user.firstName,
					inviterEmail: req.user.email,
					organizationName: organization.name,
					email: inviteeEmail,
					token,
					callback_url: SITE_URL + '/signupinvite'
				}
			});
		}

		await updateSubscriptionOrgQuantity({ organizationId });
	} catch (err) {
		Sentry.setUser(null);
		Sentry.captureException(err);
		return res.status(400).send({
			message: 'Failed to send organization invite'
		});
	}

	return res.status(200).send({
		message: `Sent an invite link to ${req.body.inviteeEmail}`
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
	let user, token;
	try {
		const { email, code } = req.body;

		user = await User.findOne({ email }).select('+publicKey');

		const membershipOrg = await MembershipOrg.findOne({
			inviteEmail: email,
			status: INVITED
		});

		if (!membershipOrg)
			throw new Error('Failed to find any invitations for email');
		
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

			return res.status(200).send({
				message: 'Successfully verified email',
				user,
			});
        }

		if (!user) {
			// initialize user account
			user = await new User({
				email
			}).save();
		}

		// generate temporary signup token
		token = createToken({
			payload: {
				userId: user._id.toString()
			},
			expiresIn: JWT_SIGNUP_LIFETIME,
			secret: JWT_SIGNUP_SECRET
		});
	} catch (err) {
		Sentry.setUser(null);
		Sentry.captureException(err);
		return res.status(400).send({
			error: 'Failed email magic link verification for organization invitation'
		});
	}

	return res.status(200).send({
		message: 'Successfully verified email',
		user,
		token
	});
};
