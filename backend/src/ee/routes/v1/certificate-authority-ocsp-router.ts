import { z } from "zod";

import {
  OCSP_MAX_REQUEST_BYTES,
  OCSP_REQUEST_CONTENT_TYPE,
  OCSP_RESPONSE_CONTENT_TYPE,
  OcspResponseStatus
} from "@app/ee/services/certificate-authority-ocsp/certificate-authority-ocsp-enums";
import { buildOcspErrorResponse } from "@app/ee/services/certificate-authority-ocsp/certificate-authority-ocsp-fns";
import { RateLimitError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { recordOcspResponseMetric, TOcspStatusLabel } from "@app/lib/telemetry/metrics";
import { ocspLimit } from "@app/server/config/rateLimiter";

const decodeGetRequest = (encoded: string): Buffer => {
  let candidate = encoded;
  if (candidate.includes("%")) {
    try {
      candidate = decodeURIComponent(candidate);
    } catch {
      return Buffer.alloc(0);
    }
  }
  return Buffer.from(candidate, "base64");
};

export const registerCaOcspRouter = async (server: FastifyZodProvider) => {
  server.addContentTypeParser(
    OCSP_REQUEST_CONTENT_TYPE,
    { parseAs: "buffer", bodyLimit: OCSP_MAX_REQUEST_BYTES },
    (_, body, done) => {
      done(null, body);
    }
  );

  const sendPreHandlerError = (
    error: unknown,
    _req: unknown,
    res: Parameters<Parameters<typeof server.route>[0]["handler"]>[1]
  ) => {
    const statusCode = (error as { statusCode?: number })?.statusCode;
    const isRateLimited = statusCode === 429 || error instanceof RateLimitError;
    const isClientError = typeof statusCode === "number" && statusCode >= 400 && statusCode < 500;

    let status = OcspResponseStatus.InternalError;
    let statusLabel: TOcspStatusLabel = "internal_error";

    if (isRateLimited) {
      status = OcspResponseStatus.TryLater;
      statusLabel = "try_later";
    } else if (isClientError) {
      status = OcspResponseStatus.MalformedRequest;
      statusLabel = "malformed_request";
    } else {
      logger.error(error, "OCSP request failed before the handler ran");
    }

    recordOcspResponseMetric({ status: statusLabel, certStatus: "none", cache: "skipped" });
    void res.header("Content-Type", OCSP_RESPONSE_CONTENT_TYPE);
    void res.status(200).send(Buffer.from(buildOcspErrorResponse(status)));
  };

  const sendResponse = async (
    caId: string,
    requestDer: Buffer,
    res: Parameters<Parameters<typeof server.route>[0]["handler"]>[1],
    allowCaching: boolean
  ) => {
    void res.header("Content-Type", OCSP_RESPONSE_CONTENT_TYPE);

    if (requestDer.length === 0 || requestDer.length > OCSP_MAX_REQUEST_BYTES) {
      recordOcspResponseMetric({ status: "malformed_request", certStatus: "none", cache: "skipped" });
      return Buffer.from(buildOcspErrorResponse(OcspResponseStatus.MalformedRequest));
    }

    try {
      const { response, maxAgeSeconds } = await server.services.certificateAuthorityOcsp.getOcspResponse({
        caId,
        requestDer
      });

      if (allowCaching && maxAgeSeconds > 0) {
        void res.header("Cache-Control", `public, max-age=${maxAgeSeconds}`);
      }

      return Buffer.from(response);
    } catch (error) {
      logger.error(error, `Failed to build OCSP response [caId=${caId}]`);
      recordOcspResponseMetric({ status: "internal_error", certStatus: "none", cache: "skipped" });
      return Buffer.from(buildOcspErrorResponse(OcspResponseStatus.InternalError));
    }
  };

  server.route({
    method: "POST",
    url: "/:caId",
    config: { rateLimit: ocspLimit },
    schema: {
      hide: true,
      params: z.object({
        caId: z.string().uuid()
      }),
      response: {
        200: z.instanceof(Buffer)
      }
    },
    errorHandler: sendPreHandlerError,
    handler: async (req, res) =>
      sendResponse(req.params.caId, Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0), res, false)
  });

  server.route({
    method: "GET",
    url: "/:caId/*",
    config: { rateLimit: ocspLimit },
    schema: {
      hide: true,
      params: z.object({
        caId: z.string().uuid(),
        "*": z.string().trim().min(1).max(OCSP_MAX_REQUEST_BYTES)
      }),
      response: {
        200: z.instanceof(Buffer)
      }
    },
    errorHandler: sendPreHandlerError,
    handler: async (req, res) => sendResponse(req.params.caId, decodeGetRequest(req.params["*"]), res, true)
  });
};
