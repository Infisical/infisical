import * as Sentry from "@sentry/node";
import { ErrorRequestHandler } from "express";
import { TokenExpiredError } from "jsonwebtoken";
import { InternalServerError, UnauthorizedRequestError } from "../utils/errors";
import { getLogger } from "../utils/logger";
import RequestError, { LogLevel, mapToWinstonLogLevel } from "../utils/requestError";
import { getNodeEnv } from "../config";

export const requestErrorHandler: ErrorRequestHandler = async (
  error: RequestError | Error,
  req,
  res,
  next
) => {
  if (res.headersSent) return next();

  const logAndCaptureException = async (error: RequestError, logLevel: LogLevel) => {
    // log stack trace & error message to the console using Winston
    (await getLogger("backend-main")).log(mapToWinstonLogLevel(logLevel), `${error.stack}\n${error.message}`);

    //* Set Sentry user identification if req.user is populated
    if (req.user !== undefined && req.user !== null) {
      Sentry.setUser({ email: (req.user as any).email });
    }

    // eliminate false-positive errors being sent to Sentry
    if ("level" in error && [LogLevel.ERROR, LogLevel.EMERGENCY, LogLevel.CRITICAL].includes(error.level)) {
      Sentry.captureException(error);
    }
  };

  if (error instanceof RequestError || error instanceof TokenExpiredError) {
    if (error instanceof TokenExpiredError) {
      error = UnauthorizedRequestError({ stack: error.stack, message: "Token expired" }) as RequestError;
    }

    logAndCaptureException((<RequestError>error), LogLevel.INFO);
  } else {
    // For unexpected errors, throw a 500 error & ensure these are sent to Sentry in prod
    error = InternalServerError({ context: { exception: error.message }, stack: error.stack }) as RequestError;
    logAndCaptureException((<RequestError>error), (await getNodeEnv() === "production") ? LogLevel.ERROR : LogLevel.DEBUG);
  }

  res
    .status((<RequestError>error).statusCode)
    .json((<RequestError>error).format(req));
  next();
};
