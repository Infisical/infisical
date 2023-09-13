import { NextFunction, Request, Response } from "express";
import { BadRequestError } from "../utils/errors";
import { BotService } from "../services";

type req = "params" | "body" | "query";

/**
 * Validate if workspace with [workspaceId] has E2EE off/disabled
 * @param {Object} obj
 * @param {String} obj.locationWorkspaceId - location of [workspaceId] on request (e.g. params, body) for parsing
 * @returns 
 */
const requireE2EEOff = ({
    locationWorkspaceId
}: {
    locationWorkspaceId: req;
}) => {
    return async (req: Request, _: Response, next: NextFunction) => {
		const workspaceId = req[locationWorkspaceId]?.workspaceId;

        const isWorkspaceE2EE = await BotService.getIsWorkspaceE2EE(workspaceId);

        if (isWorkspaceE2EE) throw BadRequestError({
            message: "Failed workspace authorization due to end-to-end encryption not being disabled"
        });
        
        return next();
    }
}

export default requireE2EEOff;