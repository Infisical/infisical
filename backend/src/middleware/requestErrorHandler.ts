import { ErrorRequestHandler } from "express";

import * as Sentry from '@sentry/node';
import { InternalServerError, UnauthorizedRequestError, UnprocessableEntityError } from "../utils/errors";
import { getLogger } from "../utils/logger";
import RequestError, { LogLevel } from "../utils/requestError";
import { NODE_ENV } from "../config";

import mongoose from "mongoose";

export const requestErrorHandler: ErrorRequestHandler = (error: RequestError | Error, req, res, next) => {
    if (res.headersSent) return next();
    if (NODE_ENV !== "production") {
        /* eslint-disable no-console */
        console.log(error)
        /* eslint-enable no-console */
    }

    //TODO: Find better way to type check for error. In current setting you need to cast type to get the functions and variables from RequestError
    if (!(error instanceof RequestError)) {
        error = InternalServerError({ context: { exception: error.message }, stack: error.stack })
        getLogger('backend-main').log((<RequestError>error).levelName.toLowerCase(), (<RequestError>error).message)
    }

    //* Set Sentry user identification if req.user is populated
    if (req.user !== undefined && req.user !== null) {
        Sentry.setUser({ email: req.user.email })
    }
    //* Only sent error to Sentry if LogLevel is one of the following level 'ERROR', 'EMERGENCY' or 'CRITICAL'
    //* with this we will eliminate false-positive errors like 'BadRequestError', 'UnauthorizedRequestError' and so on
    if ([LogLevel.ERROR, LogLevel.EMERGENCY, LogLevel.CRITICAL].includes((<RequestError>error).level)) {
        Sentry.captureException(error)
    }

    res.status((<RequestError>error).statusCode).json((<RequestError>error).format(req))
    next()
}

export const handleMongoInvalidDataError = (err: any, req: any, res: any, next: any) => {
    if (err instanceof mongoose.Error.ValidationError) {
        const errors: any = {};
        for (const field in err.errors) {
            errors[field] = err.errors[field].message;
        }

        throw UnprocessableEntityError({ message: JSON.stringify(errors) })
    } else {
        next(err);
    }
}