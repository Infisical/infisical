import {
	Workspace,
	Bot,
	Membership,
	Key,
	Secret
} from '../models';
import { createBot } from '../helpers/bot';
import { EELicenseService } from '../ee/services';
import { SecretService } from '../services';

/**
 * Create a workspace with name [name] in organization with id [organizationId]
 * and a bot for it.
 * @param {String} name - name of workspace to create.
 * @param {String} organizationId - id of organization to create workspace in
 * @param {Object} workspace - new workspace
 */
export const createWorkspace = async ({
	name,
	organizationId
}: {
	name: string;
	organizationId: string;
}) => {
	// create workspace
	const workspace = await new Workspace({
		name,
		organization: organizationId,
		autoCapitalization: true
	}).save();
  
	// initialize bot for workspace
	await createBot({
		name: 'Infisical Bot',
		workspaceId: workspace._id
	});
  
	// initialize blind index salt for workspace
	await SecretService.createSecretBlindIndexData({
		workspaceId: workspace._id
	});

	await EELicenseService.refreshOrganizationPlan(organizationId);

	return workspace;
};

/**
 * Delete workspace and all associated materials including memberships,
 * secrets, keys, etc.
 * @param {Object} obj
 * @param {String} obj.id - id of workspace to delete
 */
export const deleteWorkspace = async ({ id }: { id: string }) => {
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
};
