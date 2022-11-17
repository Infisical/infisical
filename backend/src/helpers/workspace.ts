import * as Sentry from '@sentry/node';
import {
	Workspace,
	Membership,
	Key,
	Secret
} from '../models';

/**
 * Create a workspace with name [name] in organization with id [organizationId]
 * @param {String} name - name of workspace to create.
 * @param {String} organizationId - id of organization to create workspace in
 * @param {Object} workspace - new workspace
 */
const createWorkspace = async ({
	name,
	organizationId
}: {
	name: string;
	organizationId: string;
}) => {
	let workspace;
	try {
		workspace = await new Workspace({
			name,
			organization: organizationId
		}).save();
	} catch (err) {
		Sentry.setUser(null);
		Sentry.captureException(err);
		throw new Error('Failed to create workspace');
	}

	return workspace;
};

/**
 * Delete workspace and all associated materials including memberships,
 * secrets, keys, etc.
 * @param {Object} obj
 * @param {String} obj.id - id of workspace to delete
 */
const deleteWorkspace = async ({ id }: { id: string }) => {
	try {
		await Workspace.deleteOne({ _id: id });
		await Membership.deleteMany({
			workspace: id
		});
		await Secret.deleteMany({
			workspace: id
		});
		await Key.deleteMany({
			workspace: id
		});
	} catch (err) {
		Sentry.setUser(null);
		Sentry.captureException(err);
		throw new Error('Failed to delete workspace');
	}
};

export { createWorkspace, deleteWorkspace };
