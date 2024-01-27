import { NextFunction, Request, Response } from "express";
import { getServerConfig } from "../config/serverConfig";
import { BadRequestError } from "../utils/errors";

export const disableSignUpByServerCfg = (_req: Request, _res: Response, next: NextFunction) => {
  const cfg = getServerConfig();
  if (!cfg.allowSignUp) throw BadRequestError({ message: "Signup are disabled" });
  return next();
};
