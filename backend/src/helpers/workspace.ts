import mongoose, { Types, mongo } from "mongoose";
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
	workspaceId,
	existingSession
}: { 
	workspaceId: Types.ObjectId;
	existingSession?: mongo.ClientSession;
}) => {

	let session;

	if (existingSession) {
		session = existingSession;
	} else {
		session = await mongoose.startSession();
		session.startTransaction();
	}
	
	try {
		const workspace = await Workspace.findByIdAndDelete(workspaceId, { session });
		
		if (!workspace) throw ResourceNotFoundError();
		
		await Membership.deleteMany({
			workspace: workspace._id
		}, {
			session
		});
		
		await Key.deleteMany({
			workspace: workspace._id
		}, {
			session
		});
		
		await Bot.deleteMany({
			workspace: workspace._id
		}, {
			session
		});

		await BotKey.deleteMany({
			workspace: workspace._id
		}, {
			session
		});

		await SecretBlindIndexData.deleteMany({
			workspace: workspace._id
		}, {
			session
		});

		await Secret.deleteMany({
			workspace: workspace._id
		}, {
			session
		});
		
		await SecretVersion.deleteMany({
			workspace: workspace._id
		}, {
			session
		});

		await SecretSnapshot.deleteMany({
			workspace: workspace._id
		}, {
			session
		});

		await SecretImport.deleteMany({
			workspace: workspace._id
		}, {
			session
		});

		await Folder.deleteMany({
			workspace: workspace._id
		}, {
			session
		});

		await FolderVersion.deleteMany({
			workspace: workspace._id
		}, {
			session
		});

		await Webhook.deleteMany({
			workspace: workspace._id
		}, {
			session
		});

		await TrustedIP.deleteMany({
			workspace: workspace._id
		}, {
			session
		});

		await Tag.deleteMany({
			workspace: workspace._id
		}, {
			session
		});

		await IntegrationAuth.deleteMany({
			workspace: workspace._id
		}, {
			session
		});

		await Integration.deleteMany({
			workspace: workspace._id
		}, {
			session
		});

		await ServiceToken.deleteMany({
			workspace: workspace._id
		}, {
			session
		});

		await ServiceTokenData.deleteMany({
			workspace: workspace._id
		}, {
			session
		});

		await ServiceTokenDataV3.deleteMany({
			workspace: workspace._id
		}, {
			session
		});

		await ServiceTokenDataV3Key.deleteMany({
			workspace: workspace._id
		}, {
			session
		});

		await AuditLog.deleteMany({
			workspace: workspace._id
		}, {
			session
		});

		await Log.deleteMany({
			workspace: workspace._id
		}, {
			session
		});

		await Action.deleteMany({
			workspace: workspace._id
		}, {
			session
		});

		await SecretApprovalPolicy.deleteMany({
			workspace: workspace._id
		}, {
			session
		});

		await SecretApprovalRequest.deleteMany({
			workspace: workspace._id
		}, {
			session
		});

		if (!existingSession) {
			await session.commitTransaction();
		}
		
		return workspace;
	} catch (err) {
		if (!existingSession) {
			await session.abortTransaction();
		}
		throw InternalServerError({
			message: "Failed to delete organization"
		});
	} finally {
		if (!existingSession) {
			session.endSession();
		}
	}
};
