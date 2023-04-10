import * as Sentry from '@sentry/node';
import { Types } from 'mongoose';
import { MembershipOrg, Workspace, Membership, Key } from '../models';
import {
	MembershipOrgNotFoundError,
	BadRequestError
} from '../utils/errors';

/**
 * Validate that user with id [userId] is a member of organization with id [organizationId]
 * and has at least one of the roles in [acceptedRoles]
 * @param {Object} obj
 * @param {Types.ObjectId} obj.userId
 * @param {Types.ObjectId} obj.organizationId
 * @param {String[]} obj.acceptedRoles
 */
const validateMembershipOrg = async ({
	userId,
	organizationId,
	acceptedRoles,
	acceptedStatuses
}: {
	userId: Types.ObjectId;
	organizationId: Types.ObjectId;
	acceptedRoles: Array<'owner' | 'admin' | 'member'>;
	acceptedStatuses: Array<'invited' | 'accepted'>;
}) => {
	const membershipOrg = await MembershipOrg.findOne({
		user: userId,
		organization: organizationId
	});
	
	if (!membershipOrg) {
		throw MembershipOrgNotFoundError({ message: 'Failed to find organization membership' });
	}
	
	if (!acceptedRoles.includes(membershipOrg.role)) {
		throw BadRequestError({ message: 'Failed to validate organization membership role' });
	}

	if (!acceptedStatuses.includes(membershipOrg.status)) {
		throw BadRequestError({ message: 'Failed to validate organization membership status' });
	}
	
	return membershipOrg;
}

/**
 * Return organization membership matching criteria specified in
 * query [queryObj]
 * @param {Object} queryObj - query object
 * @return {Object} membershipOrg - membership
 */
const findMembershipOrg = (queryObj: any) => {
	let membershipOrg;
	try {
		membershipOrg = MembershipOrg.findOne(queryObj);
	} catch (err) {
		Sentry.setUser(null);
		Sentry.captureException(err);
		throw new Error('Failed to find organization membership');
	}

	return membershipOrg;
};

/**
 * Add organization memberships for users with ids [userIds] to organization with
 * id [organizationId]
 * @param {Object} obj
 * @param {String[]} obj.userIds - id of users.
 * @param {String} obj.organizationId - id of organization.
 * @param {String[]} obj.roles - roles of users.
 */
const addMembershipsOrg = async ({
	userIds,
	organizationId,
	roles,
	statuses
}: {
	userIds: string[];
	organizationId: string;
	roles: string[];
	statuses: string[];
}) => {
	try {
		const operations = userIds.map((userId, idx) => {
			return {
				updateOne: {
					filter: {
						user: userId,
						organization: organizationId,
						role: roles[idx],
						status: statuses[idx]
					},
					update: {
						user: userId,
						organization: organizationId,
						role: roles[idx],
						status: statuses[idx]
					},
					upsert: true
				}
			};
		});

		await MembershipOrg.bulkWrite(operations as any);
	} catch (err) {
		Sentry.setUser(null);
		Sentry.captureException(err);
		throw new Error('Failed to add users to organization');
	}
};

/**
 * Delete organization membership with id [membershipOrgId]
 * @param {Object} obj
 * @param {String} obj.membershipOrgId - id of organization membership to delete
 */
const deleteMembershipOrg = async ({
	membershipOrgId
}: {
	membershipOrgId: string;
}) => {
	let deletedMembershipOrg;
	try {
		deletedMembershipOrg = await MembershipOrg.findOneAndDelete({
			_id: membershipOrgId
		});

		if (!deletedMembershipOrg) throw new Error('Failed to delete organization membership');

		// delete keys associated with organization membership
		if (deletedMembershipOrg?.user) {
			// case: organization membership had a registered user

			const workspaces = (
				await Workspace.find({
					organization: deletedMembershipOrg.organization
				})
			).map((w) => w._id.toString());

			await Membership.deleteMany({
				user: deletedMembershipOrg.user,
				workspace: {
					$in: workspaces
				}
			});

			await Key.deleteMany({
				receiver: deletedMembershipOrg.user,
				workspace: {
					$in: workspaces
				}
			});
		}
	} catch (err) {
		Sentry.setUser(null);
		Sentry.captureException(err);
		throw new Error('Failed to delete organization membership');
	}

	return deletedMembershipOrg;
};

export {
	validateMembershipOrg,
	findMembershipOrg,
	addMembershipsOrg, 
	deleteMembershipOrg 
}; 
