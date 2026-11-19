import { FastifyReply } from "fastify";
import { z } from "zod";

import { TMicrosoftAutoenrollmentResponse } from "@app/ee/services/microsoft-autoenrollment/microsoft-autoenrollment-types";
import { microsoftAutoenrollmentLimit } from "@app/server/config/rateLimiter";

import { MicrosoftAutoenrollmentParamsSchema } from "./microsoft-autoenrollment-schemas";

const MAX_SOAP_MESSAGE_SIZE = 64 * 1024;
const SOAP_CONTENT_TYPE = "application/soap+xml";

const sendSoapResponse = (res: FastifyReply, response: TMicrosoftAutoenrollmentResponse) => {
  void res
    .status(response.statusCode)
    .headers({ ...response.headers, "Content-Type": `${SOAP_CONTENT_TYPE}; charset=utf-8` });
  return res.send(response.body);
};

export const registerMicrosoftAutoenrollmentRouter = async (server: FastifyZodProvider) => {
  server.addContentTypeParser(
    SOAP_CONTENT_TYPE,
    { parseAs: "string", bodyLimit: MAX_SOAP_MESSAGE_SIZE },
    (_req, body, done) => done(null, body)
  );

  server.route({
    method: "POST",
    url: "/cep/applications/:applicationId/profiles/:profileId",
    config: { rateLimit: microsoftAutoenrollmentLimit },
    schema: {
      operationId: "getMicrosoftAutoenrollmentPolicies",
      consumes: [SOAP_CONTENT_TYPE],
      params: MicrosoftAutoenrollmentParamsSchema,
      body: z.string().max(MAX_SOAP_MESSAGE_SIZE)
    },
    handler: async (req, res) => {
      const response = await server.services.microsoftAutoenrollment.getPolicies({
        applicationId: req.params.applicationId,
        profileId: req.params.profileId,
        authorizationHeader: req.headers.authorization,
        body: req.body,
        clientIp: req.ip
      });
      return sendSoapResponse(res, response);
    }
  });

  server.route({
    method: "POST",
    url: "/ces/applications/:applicationId/profiles/:profileId",
    config: { rateLimit: microsoftAutoenrollmentLimit },
    schema: {
      operationId: "requestMicrosoftAutoenrollmentCertificate",
      consumes: [SOAP_CONTENT_TYPE],
      params: MicrosoftAutoenrollmentParamsSchema,
      body: z.string().max(MAX_SOAP_MESSAGE_SIZE)
    },
    handler: async (req, res) => {
      const response = await server.services.microsoftAutoenrollment.requestSecurityToken({
        applicationId: req.params.applicationId,
        profileId: req.params.profileId,
        authorizationHeader: req.headers.authorization,
        body: req.body,
        clientIp: req.ip
      });
      return sendSoapResponse(res, response);
    }
  });
};
