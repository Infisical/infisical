import * as Sentry from "@sentry/node";
import { ErrorRequestHandler } from "express";
import { TokenExpiredError } from "jsonwebtoken";
import { InternalServerError, UnauthorizedRequestError } from "../utils/errors";
import { logger } from "../utils/logging";
import RequestError, { mapToPinoLogLevel } from "../utils/requestError";
import { ForbiddenError } from "@casl/ability";

export const requestErrorHandler: ErrorRequestHandler = async (
  err: RequestError | Error,
  req,
  res,
  next
) => {
  if (res.headersSent) return next();

  let error: RequestError;

  switch (true) {
    case err instanceof TokenExpiredError:
      error = UnauthorizedRequestError({ stack: err.stack, message: "Token expired" });
      break;
    case err instanceof ForbiddenError:
      error = UnauthorizedRequestError({ context: { exception: err.message }, stack: err.stack })
      break;
    case err instanceof RequestError:
      error = err as RequestError;
      break;
    default:
      error = InternalServerError({ context: { exception: err.message }, stack: err.stack });
      break;
  }

  logger[mapToPinoLogLevel(error.level)]({ msg: error });

  if (req.user) {
    Sentry.setUser({ email: (req.user as any).email });
  }

  Sentry.captureException(error);

  delete (<any>error).stacktrace // remove stack trace from being sent to client
  res.status((<RequestError>error).statusCode).json(error); // revise json part here

  next();
};
