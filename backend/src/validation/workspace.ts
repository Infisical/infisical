import { Types } from "mongoose";
import {
    IServiceAccount,
    IServiceTokenData,
    IUser,
    SecretBlindIndexData,
    ServiceAccount,
    ServiceTokenData,
    User,
    Workspace,
} from "../models";
import { validateServiceAccountClientForWorkspace } from "./serviceAccount";
import { validateUserClientForWorkspace } from "./user";
import { validateServiceTokenDataClientForWorkspace } from "./serviceTokenData";
import { 
	BadRequestError,
    UnauthorizedRequestError,
    WorkspaceNotFoundError, 
} from "../utils/errors";
import {
    AUTH_MODE_API_KEY,
    AUTH_MODE_JWT,
    AUTH_MODE_SERVICE_ACCOUNT,
    AUTH_MODE_SERVICE_TOKEN,
} from "../variables";
import { BotService } from "../services";

/**
 * Validate authenticated clients for workspace with id [workspaceId] based
 * on any known permissions.
 * @param {Object} obj
 * @param {Object} obj.authData - authenticated client details
 * @param {Types.ObjectId} obj.workspaceId - id of workspace to validate against
 * @param {String} obj.environment - (optional) environment in workspace to validate against
 * @param {Array<'admin' | 'member'>} obj.acceptedRoles - accepted workspace roles
 * @param {String[]} obj.requiredPermissions - required permissions as part of the endpoint
 */
export const validateClientForWorkspace = async ({
	authData,
	workspaceId,
	environment,
	acceptedRoles,
	requiredPermissions,
	requireBlindIndicesEnabled,
	requireE2EEOff,
}: {
	authData: {
		authMode: string;
		authPayload: IUser | IServiceAccount | IServiceTokenData;
	};
	workspaceId: Types.ObjectId;
	environment?: string;
	acceptedRoles: Array<"admin" | "member">;
	requiredPermissions?: string[];
	requireBlindIndicesEnabled: boolean;
	requireE2EEOff: boolean;
}) => {
	const workspace = await Workspace.findById(workspaceId);

	if (!workspace) throw WorkspaceNotFoundError({
		message: "Failed to find workspace",
	});

	if (requireBlindIndicesEnabled) {
		// case: blind indices are not enabled for secrets in this workspace
		// (i.e. workspace was created before blind indices were introduced
		// and no admin has enabled it)
		
		const secretBlindIndexData = await SecretBlindIndexData.exists({
			workspace: new Types.ObjectId(workspaceId),
		});
		
		if (!secretBlindIndexData) throw UnauthorizedRequestError({
			message: "Failed workspace authorization due to blind indices not being enabled",
		});
	}
	
	if (requireE2EEOff) {
		const isWorkspaceE2EE = await BotService.getIsWorkspaceE2EE(workspaceId);
		
		if (isWorkspaceE2EE) throw BadRequestError({
			message: "Failed workspace authorization due to end-to-end encryption not being disabled",
		});
	}

	if (authData.authMode === AUTH_MODE_JWT && authData.authPayload instanceof User) {
		const membership = await validateUserClientForWorkspace({
			user: authData.authPayload,
			workspaceId,
			environment,
			acceptedRoles,
			requiredPermissions,
		});
		
		return ({ membership, workspace });
	}

	if (authData.authMode === AUTH_MODE_SERVICE_ACCOUNT && authData.authPayload instanceof ServiceAccount) {
		await validateServiceAccountClientForWorkspace({
			serviceAccount: authData.authPayload,
			workspaceId,
			environment,
			requiredPermissions,
		});
		
		return {};
	}
	
	if (authData.authMode === AUTH_MODE_SERVICE_TOKEN && authData.authPayload instanceof ServiceTokenData) {
		await validateServiceTokenDataClientForWorkspace({
			serviceTokenData: authData.authPayload,
			workspaceId,
			environment,
			requiredPermissions,
		});

		return {};
	}

	if (authData.authMode === AUTH_MODE_API_KEY && authData.authPayload instanceof User) {
		const membership = await validateUserClientForWorkspace({
			user: authData.authPayload,
			workspaceId,
			environment,
			acceptedRoles,
			requiredPermissions,
		});
		
		return ({ membership, workspace });
	}
	
	throw UnauthorizedRequestError({
		message: "Failed client authorization for workspace",
	});
}
