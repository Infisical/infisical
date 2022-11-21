import { Request, Response } from 'express';
import * as Sentry from '@sentry/node';
import { Membership, MembershipOrg, User, Key } from '../models';
import {
	findMembership,
	deleteMembership as deleteMember
} from '../helpers/membership';
import { sendMail } from '../helpers/nodemailer';
import { SITE_URL } from '../config';
import { ADMIN, MEMBER, GRANTED, ACCEPTED } from '../variables';

/**
 * Check that user is a member of workspace with id [workspaceId]
 * @param req
 * @param res
 * @returns
 */
export const validateMembership = async (req: Request, res: Response) => {
	try {
		const { workspaceId } = req.params;

		// validate membership
		const membership = await findMembership({
			user: req.user._id,
			workspace: workspaceId
		});

		if (!membership) {
			throw new Error('Failed to validate membership');
		}
	} catch (err) {
		Sentry.setUser({ email: req.user.email });
		Sentry.captureException(err);
		return res.status(400).send({
			message: 'Failed workspace connection check'
		});
	}

	return res.status(200).send({
		message: 'Workspace membership confirmed'
	});
};

/**
 * Delete membership with id [membershipId]
 * @param req
 * @param res
 * @returns
 */
export const deleteMembership = async (req: Request, res: Response) => {
	let deletedMembership;
	try {
		const { membershipId } = req.params;

		// check if membership to delete exists
		const membershipToDelete = await Membership.findOne({
			_id: membershipId
		}).populate('user');

		if (!membershipToDelete) {
			throw new Error(
				"Failed to delete workspace membership that doesn't exist"
			);
		}

		// check if user is a member and admin of the workspace
		// whose membership we wish to delete
		const membership = await Membership.findOne({
			user: req.user._id,
			workspace: membershipToDelete.workspace
		});

		if (!membership) {
			throw new Error('Failed to validate workspace membership');
		}

		if (membership.role !== ADMIN) {
			// user is not an admin member of the workspace
			throw new Error('Insufficient role for deleting workspace membership');
		}

		// delete workspace membership
		deletedMembership = await deleteMember({
			membershipId: membershipToDelete._id.toString()
		});
	} catch (err) {
		Sentry.setUser({ email: req.user.email });
		Sentry.captureException(err);
		return res.status(400).send({
			message: 'Failed to delete membership'
		});
	}

	return res.status(200).send({
		deletedMembership
	});
};

/**
 * Change and return workspace membership role
 * @param req
 * @param res
 * @returns
 */
export const changeMembershipRole = async (req: Request, res: Response) => {
	let membershipToChangeRole;
	try {
		const { membershipId } = req.params;
		const { role } = req.body;

		if (![ADMIN, MEMBER].includes(role)) {
			throw new Error('Failed to validate role');
		}

		// validate target membership
		membershipToChangeRole = await findMembership({
			_id: membershipId
		});

		if (!membershipToChangeRole) {
			throw new Error('Failed to find membership to change role');
		}

		// check if user is a member and admin of target membership's
		// workspace
		const membership = await findMembership({
			user: req.user._id,
			workspace: membershipToChangeRole.workspace
		});

		if (!membership) {
			throw new Error('Failed to validate membership');
		}

		if (membership.role !== ADMIN) {
			// user is not an admin member of the workspace
			throw new Error('Insufficient role for changing member roles');
		}

		membershipToChangeRole.role = role;
		await membershipToChangeRole.save();
	} catch (err) {
		Sentry.setUser({ email: req.user.email });
		Sentry.captureException(err);
		return res.status(400).send({
			message: 'Failed to change membership role'
		});
	}

	return res.status(200).send({
		membership: membershipToChangeRole
	});
};

/**
 * Add user with email [email] to workspace with id [workspaceId]
 * @param req
 * @param res
 * @returns
 */
export const inviteUserToWorkspace = async (req: Request, res: Response) => {
	let invitee, latestKey;
	try {
		const { workspaceId } = req.params;
		const { email }: { email: string } = req.body;

		invitee = await User.findOne({
			email
		}).select('+publicKey');

		if (!invitee || !invitee?.publicKey)
			throw new Error('Failed to validate invitee');

		// validate invitee's workspace membership - ensure member isn't
		// already a member of the workspace
		const inviteeMembership = await Membership.findOne({
			user: invitee._id,
			workspace: workspaceId,
			status: GRANTED
		});

		if (inviteeMembership)
			throw new Error('Failed to add existing member of workspace');

		// validate invitee's organization membership - ensure that only
		// (accepted) organization members can be added to the workspace
		const membershipOrg = await MembershipOrg.findOne({
			user: invitee._id,
			organization: req.membership.workspace.organization,
			status: ACCEPTED
		});

		if (!membershipOrg)
			throw new Error("Failed to validate invitee's organization membership");

		// get latest key
		latestKey = await Key.findOne({
			workspace: workspaceId,
			receiver: req.user._id
		})
			.sort({ createdAt: -1 })
			.populate('sender', '+publicKey');

		// create new workspace membership
		const m = await new Membership({
			user: invitee._id,
			workspace: workspaceId,
			role: MEMBER,
			status: GRANTED
		}).save();

		await sendMail({
			template: 'workspaceInvitation.handlebars',
			subjectLine: 'Infisical workspace invitation',
			recipients: [invitee.email],
			substitutions: {
				inviterFirstName: req.user.firstName,
				inviterEmail: req.user.email,
				workspaceName: req.membership.workspace.name,
				callback_url: SITE_URL + '/login'
			}
		});
	} catch (err) {
		Sentry.setUser({ email: req.user.email });
		Sentry.captureException(err);
		return res.status(400).send({
			message: 'Failed to invite user to workspace'
		});
	}

	return res.status(200).send({
		invitee,
		latestKey
	});
};
