import * as Sentry from '@sentry/node';
import { Types } from 'mongoose';
import {
	Workspace,
	Bot,
	Membership,
	Key,
	Secret
} from '../models';
import { createBot } from '../helpers/bot';
import { validateMembership } from '../helpers/membership';

/**
 * Validate accepted clients by id including [userId], [serviceAccountId],
 * and [serviceTokenDataId] for workspace with id [workspaceId] based
 * on any known permissions.
 * @param {Object} obj
 * @param {Types.ObjectId} obj.userId - id of user
 */
const validateClientForWorkspace = async ({
	userId,
	serviceAccountId,
	serviceTokenDataId,
	workspaceId,
	environment
}: {
	userId?: Types.ObjectId;
	serviceAccountId?: Types.ObjectId;
	serviceTokenDataId?: Types.ObjectId;
	workspaceId: Types.ObjectId;
	environment?: string;
}) => {
	
	let membership;
	if (userId) {
		membership = await validateMembership({
			userId,
			workspaceId
		});
		
	}

	if (serviceAccountId) {
		// TODO
	}
	
	if (serviceTokenDataId) {
		// TODO
	}
	
	return ({
		membership
	});
}

/**
 * Create a workspace with name [name] in organization with id [organizationId]
 * and a bot for it.
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
		// create workspace
		workspace = await new Workspace({
			name,
			organization: organizationId
		}).save();
		
		const bot = await createBot({
			name: 'Infisical Bot',
			workspaceId: workspace._id.toString()
		});
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
		await Bot.deleteOne({
			workspace: id
		});
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

export {
	validateClientForWorkspace,
	createWorkspace, 
	deleteWorkspace 
};
