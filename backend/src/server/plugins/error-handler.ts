import { ForbiddenError, PureAbility } from "@casl/ability";
import fastifyPlugin from "fastify-plugin";
import jwt from "jsonwebtoken";
import { ZodError } from "zod";

import {
  BadRequestError,
  DatabaseError,
  ForbiddenRequestError,
  GatewayTimeoutError,
  InternalServerError,
  NotFoundError,
  OidcAuthError,
  RateLimitError,
  ScimRequestError,
  UnauthorizedError
} from "@app/lib/errors";

enum JWTErrors {
  JwtExpired = "jwt expired",
  JwtMalformed = "jwt malformed",
  InvalidAlgorithm = "invalid algorithm"
}

enum HttpStatusCodes {
  BadRequest = 400,
  NotFound = 404,
  Unauthorized = 401,
  Forbidden = 403,
  UnprocessableContent = 422,
  // eslint-disable-next-line @typescript-eslint/no-shadow
  InternalServerError = 500,
  GatewayTimeout = 504,
  TooManyRequests = 429
}

export const fastifyErrHandler = fastifyPlugin(async (server: FastifyZodProvider) => {
  server.setErrorHandler((error, req, res) => {
    req.log.error(error);
    if (error instanceof BadRequestError) {
      void res
        .status(HttpStatusCodes.BadRequest)
        .send({ requestId: req.id, statusCode: HttpStatusCodes.BadRequest, message: error.message, error: error.name });
    } else if (error instanceof NotFoundError) {
      void res
        .status(HttpStatusCodes.NotFound)
        .send({ requestId: req.id, statusCode: HttpStatusCodes.NotFound, message: error.message, error: error.name });
    } else if (error instanceof UnauthorizedError) {
      void res.status(HttpStatusCodes.Unauthorized).send({
        requestId: req.id,
        statusCode: HttpStatusCodes.Unauthorized,
        message: error.message,
        error: error.name
      });
    } else if (error instanceof DatabaseError || error instanceof InternalServerError) {
      void res.status(HttpStatusCodes.InternalServerError).send({
        requestId: req.id,
        statusCode: HttpStatusCodes.InternalServerError,
        message: "Something went wrong",
        error: error.name
      });
    } else if (error instanceof GatewayTimeoutError) {
      void res.status(HttpStatusCodes.GatewayTimeout).send({
        requestId: req.id,
        statusCode: HttpStatusCodes.GatewayTimeout,
        message: error.message,
        error: error.name
      });
    } else if (error instanceof ZodError) {
      void res.status(HttpStatusCodes.UnprocessableContent).send({
        requestId: req.id,
        statusCode: HttpStatusCodes.UnprocessableContent,
        error: "ValidationFailure",
        message: error.issues
      });
    } else if (error instanceof ForbiddenError) {
      void res.status(HttpStatusCodes.Forbidden).send({
        requestId: req.id,
        statusCode: HttpStatusCodes.Forbidden,
        error: "PermissionDenied",
        message: `You are not allowed to ${error.action} on ${error.subjectType}`,
        details: (error.ability as PureAbility).rulesFor(error.action as string, error.subjectType).map((el) => ({
          action: el.action,
          inverted: el.inverted,
          subject: el.subject,
          conditions: el.conditions
        }))
      });
    } else if (error instanceof ForbiddenRequestError) {
      void res.status(HttpStatusCodes.Forbidden).send({
        requestId: req.id,
        statusCode: HttpStatusCodes.Forbidden,
        message: error.message,
        error: error.name
      });
    } else if (error instanceof RateLimitError) {
      void res.status(HttpStatusCodes.TooManyRequests).send({
        requestId: req.id,
        statusCode: HttpStatusCodes.TooManyRequests,
        message: error.message,
        error: error.name
      });
    } else if (error instanceof ScimRequestError) {
      void res.status(error.status).send({
        requestId: req.id,
        schemas: error.schemas,
        status: error.status,
        detail: error.detail
      });
    } else if (error instanceof OidcAuthError) {
      void res.status(HttpStatusCodes.InternalServerError).send({
        requestId: req.id,
        statusCode: HttpStatusCodes.InternalServerError,
        message: error.message,
        error: error.name
      });
    } else if (error instanceof jwt.JsonWebTokenError) {
      let errorMessage = error.message;

      if (error.message === JWTErrors.JwtExpired) {
        errorMessage = "Your token has expired. Please re-authenticate.";
      } else if (error.message === JWTErrors.JwtMalformed) {
        errorMessage =
          "The provided access token is malformed. Please use a valid token or generate a new one and try again.";
      } else if (error.message === JWTErrors.InvalidAlgorithm) {
        errorMessage =
          "The access token is signed with an invalid algorithm. Please provide a valid token and try again.";
      }

      void res.status(HttpStatusCodes.Forbidden).send({
        requestId: req.id,
        statusCode: HttpStatusCodes.Forbidden,
        error: "TokenError",
        message: errorMessage
      });
    } else {
      void res.status(HttpStatusCodes.InternalServerError).send({
        requestId: req.id,
        statusCode: HttpStatusCodes.InternalServerError,
        error: "InternalServerError",
        message: "Something went wrong"
      });
    }
  });
});
