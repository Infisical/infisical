import net from "net";
import { NextFunction, Request, Response } from "express";
import { UnauthorizedRequestError } from "../utils/errors";
import { extractIPDetails } from "../utils/ip";
import { ActorType, TrustedIP } from "../ee/models";

type req = "params" | "body" | "query";

/**
 * Validate if workspace with [workspaceId] has E2EE off/disabled
 * @param {Object} obj
 * @param {String} obj.locationWorkspaceId - location of [workspaceId] on request (e.g. params, body) for parsing
 * @returns 
 */
const requireIPAllowlistCheck = ({
    locationWorkspaceId
}: {
    locationWorkspaceId: req;
}) => {
    return async (req: Request, _: Response, next: NextFunction) => {
		const workspaceId = req[locationWorkspaceId]?.workspaceId;
        
        if (req.authData.actor.type === ActorType.SERVICE) {
            const trustedIps = await TrustedIP.find({
                workspace: workspaceId
            });

            if (trustedIps.length > 0) {
            // case: check the IP address of the inbound request against trusted IPs

            const blockList = new net.BlockList();

            for (const trustedIp of trustedIps) {
                if (trustedIp.prefix !== undefined) {
                    blockList.addSubnet(trustedIp.ipAddress, trustedIp.prefix, trustedIp.type);
                } else {
                    blockList.addAddress(trustedIp.ipAddress, trustedIp.type);
                }
            }

            const { type } = extractIPDetails(req.authData.ipAddress);
            const check = blockList.check(req.authData.ipAddress, type);

            if (!check)
                throw UnauthorizedRequestError({
                    message: "Failed workspace authorization"
                });
            }
        }
        
        return next();
    }
}

export default requireIPAllowlistCheck;