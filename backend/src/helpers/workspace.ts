import {
	Bot,
	Key,
	Membership,
	Secret,
	Workspace,
} from "../models";
import {
	IPType,
	TrustedIP
} from "../ee/models";
import { createBot } from "../helpers/bot";
import { EELicenseService } from "../ee/services";
import { SecretService } from "../services";

/**
 * Create a workspace with name [name] in organization with id [organizationId]
 * and a bot for it.
 * @param {String} name - name of workspace to create.
 * @param {String} organizationId - id of organization to create workspace in
 * @param {Object} workspace - new workspace
 */
export const createWorkspace = async ({
	name,
	organizationId,
}: {
	name: string;
	organizationId: string;
}) => {
	// create workspace
	const workspace = await new Workspace({
		name,
		organization: organizationId,
		autoCapitalization: true,
	}).save();
  
	// initialize bot for workspace
	await createBot({
		name: "Infisical Bot",
		workspaceId: workspace._id,
	});
  
	// initialize blind index salt for workspace
	await SecretService.createSecretBlindIndexData({
		workspaceId: workspace._id,
	});
	
	// initialize default trusted IPv4 CIDR - 0.0.0.0/0
	await new TrustedIP({
		workspace: workspace._id,
		ipAddress: "0.0.0.0",
		type: IPType.IPV4,
		prefix: 0,
		isActive: true,
		comment: ""
	}).save()
	
	// initialize default trusted IPv6 CIDR - ::/0
	await new TrustedIP({
		workspace: workspace._id,
		ipAddress: "::",
		type: IPType.IPV6,
		prefix: 0,
		isActive: true,
		comment: ""
	});

	await EELicenseService.refreshPlan(organizationId);

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
		workspace: id,
	});
	await Membership.deleteMany({
		workspace: id,
	});
	await Secret.deleteMany({
		workspace: id,
	});
	await Key.deleteMany({
		workspace: id,
	});
};
