import mongoose, { Types } from "mongoose";
import {
	Bot,
	BotKey,
	Folder,
	Integration,
	IntegrationAuth,
	Key,
	Membership,
	Secret,
	SecretBlindIndexData,
	SecretImport,
	ServiceToken,
	ServiceTokenData,
	ServiceTokenDataV3,
	ServiceTokenDataV3Key,
	Tag,
	Webhook,
	Workspace
} from "../models";
import {
	Action,
	AuditLog,
	FolderVersion,
	IPType,
	Log,
	SecretApprovalPolicy,
	SecretApprovalRequest,
	SecretSnapshot,
	SecretVersion,
	TrustedIP
} from "../ee/models";
import { createBot } from "../helpers/bot";
import { EELicenseService } from "../ee/services";
import { SecretService } from "../services";
import { 
	InternalServerError,
	ResourceNotFoundError
} from "../utils/errors";

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
	organizationId: Types.ObjectId;
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
export const deleteWorkspace = async ({ 
	workspaceId
}: { 
	workspaceId: Types.ObjectId;
}) => {
	const session = await mongoose.startSession();
	session.startTransaction();
	
	try {
		const workspace = await Workspace.findByIdAndDelete(workspaceId);
		
		if (!workspace) throw ResourceNotFoundError();
		
		await Membership.deleteMany({
			workspace: workspace._id
		});
		
		await Key.deleteMany({
			workspace: workspace._id
		});
		
		await Bot.deleteMany({
			workspace: workspace._id
		});

		await BotKey.deleteMany({
			workspace: workspace._id
		});

		await SecretBlindIndexData.deleteMany({
			workspace: workspace._id
		});

		await Secret.deleteMany({
			workspace: workspace._id
		});
		
		await SecretVersion.deleteMany({
			workspace: workspace._id
		});

		await SecretSnapshot.deleteMany({
			workspace: workspace._id
		});

		await SecretImport.deleteMany({
			workspace: workspace._id
		});

		await Folder.deleteMany({
			workspace: workspace._id
		});

		await FolderVersion.deleteMany({
			workspace: workspace._id
		});

		await Webhook.deleteMany({
			workspace: workspace._id
		});

		await TrustedIP.deleteMany({
			workspace: workspace._id
		});

		await Tag.deleteMany({
			workspace: workspace._id
		});

		await IntegrationAuth.deleteMany({
			workspace: workspace._id
		});

		await Integration.deleteMany({
			workspace: workspace._id
		});

		await ServiceToken.deleteMany({
			workspace: workspace._id
		});

		await ServiceTokenData.deleteMany({
			workspace: workspace._id
		});

		await ServiceTokenDataV3.deleteMany({
			workspace: workspace._id
		});

		await ServiceTokenDataV3Key.deleteMany({
			workspace: workspace._id
		});

		await AuditLog.deleteMany({
			workspace: workspace._id
		});

		await Log.deleteMany({
			workspace: workspace._id
		});

		await Action.deleteMany({
			workspace: workspace._id
		});

		await SecretApprovalPolicy.deleteMany({
			workspace: workspace._id
		});

		await SecretApprovalRequest.deleteMany({
			workspace: workspace._id
		});
		
		return workspace;
	} catch (err) {
		await session.abortTransaction();
		throw InternalServerError({
			message: "Failed to delete organization"
		});
	} finally {
		session.endSession();
	}
};
