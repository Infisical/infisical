import { ForbiddenError, PureAbility } from "@casl/ability";
import opentelemetry from "@opentelemetry/api";
import fastifyPlugin from "fastify-plugin";
import jwt from "jsonwebtoken";
import { ZodError } from "zod";

import { getConfig } from "@app/lib/config/env";
import {
  BadRequestError,
  CryptographyError,
  DatabaseError,
  ForbiddenRequestError,
  GatewayTimeoutError,
  InternalServerError,
  NotFoundError,
  OidcAuthError,
  PermissionBoundaryError,
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
  const appCfg = getConfig();

  const apiMeter = opentelemetry.metrics.getMeter("API");
  const errorHistogram = apiMeter.createHistogram("API_errors", {
    description: "API errors by type, status code, and name",
    unit: "1"
  });

  server.setErrorHandler((error, req, res) => {
    req.log.error(error);
    if (appCfg.OTEL_TELEMETRY_COLLECTION_ENABLED) {
      const { method } = req;
      const route = req.routerPath;
      const errorType =
        error instanceof jwt.JsonWebTokenError ? "TokenError" : error.constructor.name || "UnknownError";

      errorHistogram.record(1, {
        route,
        method,
        type: errorType,
        name: error.name
      });
    }

    if (error instanceof BadRequestError) {
      void res
        .status(HttpStatusCodes.BadRequest)
        .send({ reqId: req.id, statusCode: HttpStatusCodes.BadRequest, message: error.message, error: error.name });
    } else if (error instanceof NotFoundError) {
      void res
        .status(HttpStatusCodes.NotFound)
        .send({ reqId: req.id, statusCode: HttpStatusCodes.NotFound, message: error.message, error: error.name });
    } else if (error instanceof UnauthorizedError) {
      void res.status(HttpStatusCodes.Unauthorized).send({
        reqId: req.id,
        statusCode: HttpStatusCodes.Unauthorized,
        message: error.message,
        error: error.name
      });
    } else if (error instanceof DatabaseError) {
      void res.status(HttpStatusCodes.InternalServerError).send({
        reqId: req.id,
        statusCode: HttpStatusCodes.InternalServerError,
        message: "Something went wrong",
        error: error.name
      });
    } else if (error instanceof InternalServerError) {
      void res.status(HttpStatusCodes.InternalServerError).send({
        reqId: req.id,
        statusCode: HttpStatusCodes.InternalServerError,
        message: error.message ?? "Something went wrong",
        error: error.name
      });
    } else if (error instanceof GatewayTimeoutError) {
      void res.status(HttpStatusCodes.GatewayTimeout).send({
        reqId: req.id,
        statusCode: HttpStatusCodes.GatewayTimeout,
        message: error.message,
        error: error.name
      });
    } else if (error instanceof ZodError) {
      void res.status(HttpStatusCodes.UnprocessableContent).send({
        reqId: req.id,
        statusCode: HttpStatusCodes.UnprocessableContent,
        error: "ValidationFailure",
        message: error.issues
      });
    } else if (error instanceof ForbiddenError) {
      void res.status(HttpStatusCodes.Forbidden).send({
        reqId: req.id,
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
    } else if (error instanceof ForbiddenRequestError || error instanceof PermissionBoundaryError) {
      void res.status(HttpStatusCodes.Forbidden).send({
        reqId: req.id,
        statusCode: HttpStatusCodes.Forbidden,
        message: error.message,
        error: error.name,
        details: error?.details
      });
    } else if (error instanceof RateLimitError) {
      void res.status(HttpStatusCodes.TooManyRequests).send({
        reqId: req.id,
        statusCode: HttpStatusCodes.TooManyRequests,
        message: error.message,
        error: error.name
      });
    } else if (error instanceof ScimRequestError) {
      void res.status(error.status).send({
        reqId: req.id,
        schemas: error.schemas,
        status: error.status,
        detail: error.detail
      });
    } else if (error instanceof OidcAuthError) {
      void res.status(HttpStatusCodes.InternalServerError).send({
        reqId: req.id,
        statusCode: HttpStatusCodes.InternalServerError,
        message: error.message,
        error: error.name
      });
    } else if (error instanceof CryptographyError) {
      void res.status(HttpStatusCodes.BadRequest).send({
        reqId: req.id,
        statusCode: HttpStatusCodes.BadRequest,
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
        reqId: req.id,
        statusCode: HttpStatusCodes.Forbidden,
        error: "TokenError",
        message: errorMessage
      });
    } else {
      void res.status(HttpStatusCodes.InternalServerError).send({
        reqId: req.id,
        statusCode: HttpStatusCodes.InternalServerError,
        error: "InternalServerError",
        message: "Something went wrong"
      });
    }
  });
});
