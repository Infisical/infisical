import { NextFunction, Request, Response } from "express";
import { UnauthorizedRequestError } from "../utils/errors";

export const requireSuperAdminAccess = (req: Request, _res: Response, next: NextFunction) => {
  const isSuperAdmin = req.user.superAdmin;
  if (!isSuperAdmin) throw UnauthorizedRequestError({ message: "Requires superadmin access" });
  return next();
};
