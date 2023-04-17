import { Request, Response, NextFunction } from "express";
import { UnauthorizedRequestError } from "../utils/errors";
import IpAddress from "../models/ipAddress";
import { Types } from "mongoose";

export const requireWorkSpaceIp = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const ip = req.ip;
  if (!ip) {
    return next(
      UnauthorizedRequestError({
        message: "Unable to authorize user without an IP",
      })
    );
  }

  const { workspaceId } = req.params;
  const foundIpAddress = await IpAddress.findOne({
    ip: ip,
    workspace: new Types.ObjectId(workspaceId),
  });
  if (!foundIpAddress) {
    return next(
      UnauthorizedRequestError({
        message: "Unable to authorize user IP",
      })
    );
  }

  return next();
};
