import { createHash } from "crypto";
import fp from "fastify-plugin";
import { IncomingHttpHeaders } from "http";
import jwt from "jsonwebtoken";

import { logger } from "@app/lib/logger";
import { goSidecarFallbackCounter } from "@app/lib/telemetry/metrics";
import { AuthTokenType } from "@app/services/auth/auth-type";

type TForwardedRoute = {
  method: string;
  url: string;
  // Opt-in routes are forwarded only when named in GO_SIDECAR_FORWARD_ROUTES
  optIn?: boolean;
};

const FORWARDED_ROUTES: TForwardedRoute[] = [
  { method: "GET", url: "/api/v4/secrets" },
  { method: "GET", url: "/api/v4/secrets/:secretName" },
  { method: "GET", url: "/api/v2/folders", optIn: true }
];

export type TGoForwardingSettings = {
  enabled: boolean;
  enabledRoutes: Set<string>;
  orgIds: Set<string>;
  percent: number;
};

type TFallbackReason = "connection" | "timeout" | "5xx";

const routeKey = (method: string, url: string) => `${method}:${url}`;

const isRouteEnabled = (key: string, enabledRoutes: Set<string>) =>
  FORWARDED_ROUTES.some((r) => routeKey(r.method, r.url) === key && (!r.optIn || enabledRoutes.has(key)));

// Returns the key that scopes the rollout decision, or null when the credential is not one Go supports.
const resolveRolloutKey = (headers: IncomingHttpHeaders): string | null => {
  if (headers["x-api-key"]) return null;

  const { authorization } = headers;
  if (!authorization || !authorization.startsWith("Bearer ")) return null;
  const token = authorization.slice(7);

  if (token.startsWith("st.")) return token.split(".")[1] || null;

  const decoded = jwt.decode(token);
  if (!decoded || typeof decoded === "string") return null;

  switch (decoded.authTokenType) {
    case AuthTokenType.ACCESS_TOKEN:
      if (decoded.oauthClientId || "mcp" in decoded) return null;
      return typeof decoded.organizationId === "string" ? decoded.organizationId : null;
    case AuthTokenType.IDENTITY_ACCESS_TOKEN:
      return typeof decoded.orgId === "string" ? decoded.orgId : null;
    default:
      return null;
  }
};

const isInPercentage = (key: string, percent: number) => {
  const bucket = createHash("sha256").update(key).digest().readUInt32BE(0) % 10000;
  return bucket < percent * 100;
};

export const resolveForwardingTarget = (
  method: string,
  url: string,
  headers: IncomingHttpHeaders,
  settings: TGoForwardingSettings
): boolean => {
  if (!settings.enabled || method !== "GET") return false;
  if (!isRouteEnabled(routeKey(method, url), settings.enabledRoutes)) return false;

  const key = resolveRolloutKey(headers);
  if (!key) return false;

  return settings.orgIds.has(key) || isInPercentage(key, settings.percent);
};

const REQUEST_SKIPPED_HEADERS = new Set(["host", "connection", "content-length", "transfer-encoding"]);
const RESPONSE_SKIPPED_HEADERS = new Set(["connection", "content-length", "transfer-encoding", "keep-alive"]);

// Forwarding runs in onRequest, before the @fastify/rate-limit preValidation hook, so a forwarded
// request is counted only by Go; a fallback continues into Node's pipeline and is counted there.
export const forwardToGoSidecar = fp(
  async (server, opt: { sidecarUrl: string; getSettings: () => TGoForwardingSettings; timeoutMs?: number }) => {
    const timeoutMs = opt.timeoutMs ?? 10000;

    const recordFallback = (reason: TFallbackReason, route: string, requestId: string, detail?: string) => {
      goSidecarFallbackCounter.add(1, { reason });
      logger.warn(
        { requestId, route, reason, detail },
        `go-sidecar: Falling back to Node [route=${route}] [reason=${reason}]`
      );
    };

    server.addHook("onRequest", async (request, reply) => {
      const route = request.routeOptions.url;
      if (!route || !resolveForwardingTarget(request.method, route, request.headers, opt.getSettings())) return;

      const headers: Record<string, string> = {};
      for (const [name, value] of Object.entries(request.headers)) {
        if (!REQUEST_SKIPPED_HEADERS.has(name) && value !== undefined) {
          headers[name] = Array.isArray(value) ? value.join(", ") : value;
        }
      }
      headers["x-request-id"] = request.id;
      headers["x-real-ip"] = request.realIp;

      let response: Response;
      let body: Buffer;
      try {
        response = await fetch(new URL(request.url, opt.sidecarUrl), {
          method: "GET",
          headers,
          redirect: "manual",
          signal: AbortSignal.timeout(timeoutMs)
        });
        body = Buffer.from(await response.arrayBuffer());
      } catch (error) {
        const isTimeout = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
        recordFallback(
          isTimeout ? "timeout" : "connection",
          route,
          request.id,
          error instanceof Error ? error.name : undefined
        );
        return;
      }

      if (response.status >= 500) {
        recordFallback("5xx", route, request.id, String(response.status));
        return;
      }

      response.headers.forEach((value, name) => {
        if (!RESPONSE_SKIPPED_HEADERS.has(name)) void reply.header(name, value);
      });
      // eslint-disable-next-line consistent-return
      return reply.status(response.status).send(body);
    });
  }
);
