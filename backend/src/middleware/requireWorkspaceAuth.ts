import { NextFunction, Request, Response } from "express";
import { Types } from "mongoose";
import { validateClientForWorkspace } from "../validation";

type req = "params" | "body" | "query";

/**
 * Validate if user on request is a member with proper roles for workspace
 * on request params.
 * @param {Object} obj
 * @param {String[]} obj.acceptedRoles - accepted workspace roles for JWT auth
 * @param {String[]} obj.location - location of [workspaceId] on request (e.g. params, body) for parsing
 */
const requireWorkspaceAuth = ({
	acceptedRoles,
	locationWorkspaceId,
	locationEnvironment = undefined,
	requiredPermissions = [],
	requireBlindIndicesEnabled = false,
	requireE2EEOff = false,
	checkIPAllowlist = false
}: {
	acceptedRoles: Array<"admin" | "member">;
	locationWorkspaceId: req;
	locationEnvironment?: req | undefined;
	requiredPermissions?: string[];
	requireBlindIndicesEnabled?: boolean;
	requireE2EEOff?: boolean;
	checkIPAllowlist?: boolean;
}) => {
	return async (req: Request, res: Response, next: NextFunction) => {
		const workspaceId = req[locationWorkspaceId]?.workspaceId;
		const environment = locationEnvironment ? req[locationEnvironment]?.environment : undefined;
		
		// validate clients
		const { membership, workspace } = await validateClientForWorkspace({
			authData: req.authData,
			workspaceId: new Types.ObjectId(workspaceId),
			environment,
			acceptedRoles,
			requiredPermissions,
			requireBlindIndicesEnabled,
			requireE2EEOff,
			checkIPAllowlist
		});
		
		if (membership) {
			req.membership = membership;
		}
		
		if (workspace) {
			req.workspace = workspace;
		}

		return next();
	};
};

export default requireWorkspaceAuth;
