import * as Sentry from "@sentry/node";
import { ErrorRequestHandler } from "express";
import { TokenExpiredError } from "jsonwebtoken";
import { InternalServerError, UnauthorizedRequestError } from "../utils/errors";
import { getLogger } from "../utils/logger";
import RequestError from "../utils/requestError";
import { ForbiddenError } from "@casl/ability";

export const requestErrorHandler: ErrorRequestHandler = async (
  error: RequestError | Error,
  req,
  res,
  next
) => {
  if (res.headersSent) return next();

  const logAndCaptureException = async (error: RequestError) => {
    (await getLogger("backend-main")).log(
      (<RequestError>error).levelName.toLowerCase(),
      `${error.stack}\n${error.message}`
    );

    //* Set Sentry user identification if req.user is populated
    if (req.user !== undefined && req.user !== null) {
      Sentry.setUser({ email: (req.user as any).email });
    }

    Sentry.captureException(error);
  };

  if (error instanceof RequestError) {
    if (error instanceof TokenExpiredError) {
      error = UnauthorizedRequestError({ stack: error.stack, message: "Token expired" });
    }
    await logAndCaptureException((<RequestError>error));
  } else {
    if (error instanceof ForbiddenError) {
      error = UnauthorizedRequestError({ context: { exception: error.message }, stack: error.stack })
    } else {
      error = InternalServerError({ context: { exception: error.message }, stack: error.stack });
    }

    await logAndCaptureException((<RequestError>error));
  }

  delete (<any>error).stacktrace // remove stack trace from being sent to client
  res.status((<RequestError>error).statusCode).json(error);

  next();
};
