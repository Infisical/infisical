import { ForbiddenError, PureAbility } from "@casl/ability";
import { requestContext } from "@fastify/request-context";
import opentelemetry from "@opentelemetry/api";
import fastifyPlugin from "fastify-plugin";
import jwt from "jsonwebtoken";
import { ZodError } from "zod";

import { AcmeError } from "@app/ee/services/pki-acme/pki-acme-errors";
import { getConfig } from "@app/lib/config/env";
import {
  BadRequestError,
  CryptographyError,
  DatabaseError,
  ForbiddenRequestError,
  GatewayTimeoutError,
  GoneError,
  InternalServerError,
  NotFoundError,
  OidcAuthError,
  PermissionBoundaryError,
  PolicyViolationError,
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
  Unauthorized = 401,
  Forbidden = 403,
  NotFound = 404,
  Gone = 410,
  UnprocessableContent = 422,
  TooManyRequests = 429,
  // eslint-disable-next-line @typescript-eslint/no-shadow
  InternalServerError = 500,
  GatewayTimeout = 504
}

export const fastifyErrHandler = fastifyPlugin(async (server: FastifyZodProvider) => {
  const appCfg = getConfig();

  const apiMeter = opentelemetry.metrics.getMeter("API");
  const errorHistogram = apiMeter.createHistogram("API_errors", {
    description: "API errors by type, status code, and name",
    unit: "1"
  });

  const infisicalMeter = opentelemetry.metrics.getMeter("Infisical");
  const errorCounter = infisicalMeter.createCounter("infisical.http.server.error.count", {
    description: "Total number of API errors in Infisical (covers both human users and machine identities)",
    unit: "{error}"
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

      const orgId = requestContext.get("orgId");
      const orgName = requestContext.get("orgName");
      const userAuthInfo = requestContext.get("userAuthInfo");
      const identityAuthInfo = requestContext.get("identityAuthInfo");
      const projectDetails = requestContext.get("projectDetails");

      const attributes: Record<string, string | number> = {
        "http.request.method": method,
        "http.route": route,
        "error.type": errorType,
        "error.name": error.name
      };

      if (orgId) {
        attributes["infisical.organization.id"] = orgId;
      }
      if (orgName) {
        attributes["infisical.organization.name"] = orgName;
      }

      if (userAuthInfo) {
        if (userAuthInfo.userId) {
          attributes["infisical.user.id"] = userAuthInfo.userId;
        }
        if (userAuthInfo.email) {
          attributes["infisical.user.email"] = userAuthInfo.email;
        }
      }

      if (identityAuthInfo) {
        if (identityAuthInfo.identityId) {
          attributes["infisical.identity.id"] = identityAuthInfo.identityId;
        }
        if (identityAuthInfo.identityName) {
          attributes["infisical.identity.name"] = identityAuthInfo.identityName;
        }
        if (identityAuthInfo.authMethod) {
          attributes["infisical.auth.method"] = identityAuthInfo.authMethod;
        }
      }

      if (projectDetails) {
        if (projectDetails.id) {
          attributes["infisical.project.id"] = projectDetails.id;
        }
        if (projectDetails.name) {
          attributes["infisical.project.name"] = projectDetails.name;
        }
      }

      const userAgent = req.headers["user-agent"];
      if (userAgent) {
        attributes["user_agent.original"] = userAgent;
      }

      if (req.realIp) {
        attributes["client.address"] = req.realIp;
      }

      errorCounter.add(1, attributes);
    }

    if (error instanceof BadRequestError) {
      void res
        .status(HttpStatusCodes.BadRequest)
        .send({ reqId: req.id, statusCode: HttpStatusCodes.BadRequest, message: error.message, error: error.name });
    } else if (error instanceof NotFoundError) {
      void res
        .status(HttpStatusCodes.NotFound)
        .send({ reqId: req.id, statusCode: HttpStatusCodes.NotFound, message: error.message, error: error.name });
    } else if (error instanceof GoneError) {
      void res
        .status(HttpStatusCodes.Gone)
        .send({ reqId: req.id, statusCode: HttpStatusCodes.Gone, message: error.message, error: error.name });
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
    } else if (error instanceof AcmeError) {
      void res
        .type("application/problem+json")
        .status(error.status)
        .send({
          reqId: req.id,
          error: error.name,
          status: error.status,
          type: `urn:ietf:params:acme:error:${error.type}`,
          detail: error.message
          // TODO: add subproblems if they exist
        });
    } else if (error instanceof PolicyViolationError) {
      void res.status(HttpStatusCodes.Forbidden).send({
        reqId: req.id,
        statusCode: HttpStatusCodes.Forbidden,
        error: "PolicyViolationError",
        message: error.message,
        details: error.details
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
