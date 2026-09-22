import { z } from "zod";

import {
  OCSP_ERROR_LOGS_PER_WINDOW,
  OCSP_LOG_THROTTLE_WINDOW_MS,
  OCSP_MAX_REQUEST_BYTES,
  OCSP_MAX_TRACKED_LOG_KEYS,
  OCSP_REJECTION_LOGS_PER_WINDOW,
  OCSP_REQUEST_CONTENT_TYPE,
  OCSP_RESPONSE_CONTENT_TYPE,
  OcspResponseStatus
} from "@app/ee/services/certificate-authority-ocsp/certificate-authority-ocsp-enums";
import { buildOcspErrorResponse } from "@app/ee/services/certificate-authority-ocsp/certificate-authority-ocsp-fns";
import { logger } from "@app/lib/logger";
import { createLogThrottle, formatSuppressed } from "@app/lib/logger/log-throttle";
import { recordOcspResponseMetric } from "@app/lib/telemetry/metrics";
import { readLimit } from "@app/server/config/rateLimiter";

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

const rejectionLogThrottle = createLogThrottle({
  windowMs: OCSP_LOG_THROTTLE_WINDOW_MS,
  maxPerWindow: OCSP_REJECTION_LOGS_PER_WINDOW,
  maxTrackedKeys: OCSP_MAX_TRACKED_LOG_KEYS
});

const errorLogThrottle = createLogThrottle({
  windowMs: OCSP_LOG_THROTTLE_WINDOW_MS,
  maxPerWindow: OCSP_ERROR_LOGS_PER_WINDOW,
  maxTrackedKeys: OCSP_MAX_TRACKED_LOG_KEYS
});

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
    _: unknown,
    res: Parameters<Parameters<typeof server.route>[0]["handler"]>[1]
  ) => {
    const { shouldLog, suppressed } = rejectionLogThrottle.take("pre-handler");
    if (shouldLog) logger.error(error, `Rejected OCSP request before the handler ran${formatSuppressed(suppressed)}`);
    recordOcspResponseMetric({ result: "malformed_request", cache: "skipped" });
    void res.header("Content-Type", OCSP_RESPONSE_CONTENT_TYPE);
    void res.status(200).send(Buffer.from(buildOcspErrorResponse(OcspResponseStatus.MalformedRequest)));
  };

  const sendResponse = async (
    caId: string,
    requestDer: Buffer,
    res: Parameters<Parameters<typeof server.route>[0]["handler"]>[1],
    allowCaching: boolean
  ) => {
    void res.header("Content-Type", OCSP_RESPONSE_CONTENT_TYPE);

    if (requestDer.length === 0 || requestDer.length > OCSP_MAX_REQUEST_BYTES) {
      recordOcspResponseMetric({ result: "malformed_request", cache: "skipped" });
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
      const { shouldLog, suppressed } = errorLogThrottle.take("build-response");
      if (shouldLog) {
        logger.error(error, `Failed to build OCSP response [caId=${caId}]${formatSuppressed(suppressed)}`);
      }
      recordOcspResponseMetric({ result: "internal_error", cache: "skipped" });
      return Buffer.from(buildOcspErrorResponse(OcspResponseStatus.InternalError));
    }
  };

  server.route({
    method: "POST",
    url: "/:caId",
    config: { rateLimit: readLimit },
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
    config: { rateLimit: readLimit },
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
