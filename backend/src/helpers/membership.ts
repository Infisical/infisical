import * as Sentry from '@sentry/node';
import { Membership, Key } from '../models';

/**
 * Return membership matching criteria specified in query [queryObj]
 * @param {Object} queryObj - query object
 * @return {Object} membership - membership
 */
const findMembership = async (queryObj: any) => {
	let membership;
	try {
		membership = await Membership.findOne(queryObj);
	} catch (err) {
		Sentry.setUser(null);
		Sentry.captureException(err);
		throw new Error('Failed to find membership');
	}

	return membership;
};

/**
 * Add memberships for users with ids [userIds] to workspace with
 * id [workspaceId]
 * @param {Object} obj
 * @param {String[]} obj.userIds - id of users.
 * @param {String} obj.workspaceId - id of workspace.
 * @param {String[]} obj.roles - roles of users.
 * @param {String[]} obj.statuses - statuses of users.
 */
const addMemberships = async ({
	userIds,
	workspaceId,
	roles,
	statuses
}: {
	userIds: string[];
	workspaceId: string;
	roles: string[];
	statuses: string[];
}): Promise<void> => {
	try {
		const operations = userIds.map((userId, idx) => {
			return {
				updateOne: {
					filter: {
						user: userId,
						workspace: workspaceId,
						role: roles[idx],
						status: statuses[idx]
					},
					update: {
						user: userId,
						workspace: workspaceId,
						role: roles[idx],
						status: statuses[idx]
					},
					upsert: true
				}
			};
		});

		await Membership.bulkWrite(operations as any);
	} catch (err) {
		Sentry.setUser(null);
		Sentry.captureException(err);
		throw new Error('Failed to add users to workspace');
	}
};

/**
 * Delete membership with id [membershipId]
 * @param {Object} obj
 * @param {String} obj.membershipId - id of membership to delete
 */
const deleteMembership = async ({ membershipId }: { membershipId: string }) => {
	let deletedMembership;
	try {
		deletedMembership = await Membership.findOneAndDelete({
			_id: membershipId
		});

		// delete keys associated with the membership
		if (deletedMembership?.user) {
			// case: membership had a registered user
			await Key.deleteMany({
				receiver: deletedMembership.user,
				workspace: deletedMembership.workspace
			});
		}
	} catch (err) {
		Sentry.setUser(null);
		Sentry.captureException(err);
		throw new Error('Failed to delete membership');
	}

	return deletedMembership;
};

export { addMemberships, findMembership, deleteMembership };
