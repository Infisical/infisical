import { ForbiddenError } from "@casl/ability";
import fastifyPlugin from "fastify-plugin";
import jwt from "jsonwebtoken";
import { ZodError } from "zod";

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
    } else if (error instanceof jwt.JsonWebTokenError) {
      const message = (() => {
        if (error.message === JWTErrors.JwtExpired) {
          return "Your token has expired. Please re-authenticate.";
        }
        if (error.message === JWTErrors.JwtMalformed) {
          return "The provided access token is malformed. Please use a valid token or generate a new one and try again.";
        }
        if (error.message === JWTErrors.InvalidAlgorithm) {
          return "The access token is signed with an invalid algorithm. Please provide a valid token and try again.";
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
