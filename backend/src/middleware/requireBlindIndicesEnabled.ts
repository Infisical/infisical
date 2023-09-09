import { NextFunction, Request, Response } from "express";
import { Types } from "mongoose";
import { SecretBlindIndexData } from "../models";
import { UnauthorizedRequestError } from "../utils/errors";

type req = "params" | "body" | "query";

/**
 * Validate if workspace with [workspaceId] has blind indices enabled
 * @param {Object} obj
 * @param {String} obj.locationWorkspaceId - location of [workspaceId] on request (e.g. params, body) for parsing
 * @returns 
 */
const requireBlindIndicesEnabled = ({
    locationWorkspaceId
}: {
    locationWorkspaceId: req;
}) => {
    return async (req: Request, res: Response, next: NextFunction) => {
		const workspaceId = req[locationWorkspaceId]?.workspaceId;

        const secretBlindIndexData = await SecretBlindIndexData.exists({
            workspace: new Types.ObjectId(workspaceId)
        });

        if (!secretBlindIndexData) throw UnauthorizedRequestError({
            message: "Failed workspace authorization due to blind indices not being enabled"
        });
        
        return next();
    }
}

export default requireBlindIndicesEnabled;