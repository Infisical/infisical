import { ForbiddenError } from "@casl/ability";
import fastifyPlugin from "fastify-plugin";
import { ZodError } from "zod";

import {
  BadRequestError,
  DatabaseError,
  ForbiddenRequestError,
  InternalServerError,
  UnauthorizedError
} from "@app/lib/errors";

export const fastifyErrHandler = fastifyPlugin(async (server: FastifyZodProvider) => {
  server.setErrorHandler((error, req, res) => {
    req.log.error(error);
    if (error instanceof BadRequestError) {
      res.status(400).send({ statusCode: 400, message: error.message, error: error.name });
    } else if (error instanceof UnauthorizedError) {
      res.status(403).send({ statusCode: 403, message: error.message, error: error.name });
    } else if (error instanceof DatabaseError || error instanceof InternalServerError) {
      res.status(500).send({ statusCode: 500, message: "Something went wrong", error: error.name });
    } else if (error instanceof ZodError) {
      res.status(403).send({ statusCode: 403, error: "ValidationFailure", message: error.issues });
    } else if (error instanceof ForbiddenError) {
      res.status(401).send({
        statusCode: 401,
        error: "PermissionDenied",
        message: `You are not allowed to ${error.action} on ${error.subjectType}`
      });
    } else {
      res.send(error);
    }
  });
});
