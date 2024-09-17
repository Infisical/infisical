import { ForbiddenError } from "@casl/ability";
import fastifyPlugin from "fastify-plugin";
import { JsonWebTokenError } from "jsonwebtoken";
import { ZodError } from "zod";

import { UserAgentType } from "@app/ee/services/audit-log/audit-log-types";
import {
  BadRequestError,
  DatabaseError,
  InternalServerError,
  NotFoundError,
  ScimRequestError,
  UnauthorizedError
} from "@app/lib/errors";

enum JWTErrors {
  JwtExpired = "jwt expired",
  JwtMalformed = "jwt malformed",
  InvalidAlgorithm = "invalid algorithm"
}

export const fastifyErrHandler = fastifyPlugin(async (server: FastifyZodProvider) => {
  server.setErrorHandler((error, req, res) => {
    req.log.error(error);
    if (error instanceof BadRequestError) {
      void res.status(400).send({ statusCode: 400, message: error.message, error: error.name });
    } else if (error instanceof NotFoundError) {
      void res.status(404).send({ statusCode: 404, message: error.message, error: error.name });
    } else if (error instanceof UnauthorizedError) {
      void res.status(403).send({ statusCode: 403, message: error.message, error: error.name });
    } else if (error instanceof DatabaseError || error instanceof InternalServerError) {
      void res.status(500).send({ statusCode: 500, message: "Something went wrong", error: error.name });
    } else if (error instanceof ZodError) {
      void res.status(403).send({ statusCode: 403, error: "ValidationFailure", message: error.issues });
    } else if (error instanceof ForbiddenError) {
      void res.status(401).send({
        statusCode: 401,
        error: "PermissionDenied",
        message: `You are not allowed to ${error.action} on ${error.subjectType}`
      });
    } else if (error instanceof ScimRequestError) {
      void res.status(error.status).send({
        schemas: error.schemas,
        status: error.status,
        detail: error.detail
      });
      // Handle JWT errors and make them more human-readable for the end-user.
    } else if (error instanceof JsonWebTokenError) {
      const isCliRequest = req.headers["user-agent"] === UserAgentType.CLI;

      const message = (() => {
        if (error.message === JWTErrors.JwtExpired) {
          return "Your token has expired. Please re-authenticate.";
        }
        if (error.message === JWTErrors.JwtMalformed) {
          if (isCliRequest) {
            return "The access token is malformed. Are you sure the token you are using is correct? Check the INFISICAL_TOKEN environment variable, or the --token flag. If you are using user-login, please run [infisical login] to re-authenticate.";
          }
          return "The access token is malformed. Please ensure that the token is in the correct format and try again.";
        }
        if (error.message === JWTErrors.InvalidAlgorithm) {
          if (isCliRequest) {
            return "Invalid algorithm. Are you sure you are using the correct authentication method? Make sure to check that you don't have the INFISICAL_TOKEN variable set in your environment variables. If you are intentionally using the INFISICAL_TOKEN variable, make sure you are using the correct token." as const;
          }
          return "The access token is signed with an invalid algorithm. Please ensure that the token is in the correct format and try again. We recommend obtaining a new token.";
        }

        return error.message;
      })();

      void res.status(401).send({
        statusCode: 401,
        error: "TokenError",
        message
      });
    } else {
      void res.send(error);
    }
  });
});
