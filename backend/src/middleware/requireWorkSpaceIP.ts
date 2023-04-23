import { Request, Response, NextFunction } from "express";
import { UnauthorizedRequestError } from "../utils/errors";
import IPAddress from "../models/IPAddress";
import { Types } from "mongoose";

export const requireWorkSpaceIP = async (
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
  const ipAddressCount = await IPAddress.count({
    ip: ip,
    workspace: new Types.ObjectId(workspaceId),
  });
  if (!ipAddressCount) {
    return next(
      UnauthorizedRequestError({
        message: "Unable to authorize user IP",
      })
    );
  }

  return next();
};
