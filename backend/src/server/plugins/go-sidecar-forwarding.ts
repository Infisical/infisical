import { createHash } from "crypto";
import fp from "fastify-plugin";
import { IncomingHttpHeaders } from "http";
import jwt from "jsonwebtoken";

import { logger } from "@app/lib/logger";
import { goSidecarFallbackCounter } from "@app/lib/telemetry/metrics";
import { AuthTokenType } from "@app/services/auth/auth-type";

const FORWARDED_ROUTES: { method: string; url: string }[] = [
  { method: "GET", url: "/api/v4/secrets" },
  { method: "GET", url: "/api/v4/secrets/:secretName" },
  { method: "GET", url: "/api/v2/folders" }
];

export type TGoForwardingSettings = {
  enabled: boolean;
  enabledRoutes: Set<string>;
  orgIds: Set<string>;
  percent: number;
};

export const splitList = (value?: string) =>
  new Set(
    (value ?? "")
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean)
  );

type TFallbackReason = "connection" | "timeout" | "5xx";

const routeKey = (method: string, url: string) => `${method}:${url}`;

const isRouteEnabled = (key: string, enabledRoutes: Set<string>) =>
  enabledRoutes.has(key) && FORWARDED_ROUTES.some((r) => routeKey(r.method, r.url) === key);

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

export const shouldForward = (
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
  async (
    server,
    opt: {
      sidecarUrl: string;
      getSettings: () => TGoForwardingSettings;
      isDisabled?: () => Promise<boolean>;
      timeoutMs?: number;
    }
  ) => {
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
      if (!route || !shouldForward(request.method, route, request.headers, opt.getSettings())) return undefined;

      if (opt.isDisabled && (await opt.isDisabled().catch(() => true))) return undefined;

      const headers: Record<string, string> = {};
      for (const [name, value] of Object.entries(request.headers)) {
        if (!REQUEST_SKIPPED_HEADERS.has(name) && value !== undefined) {
          headers[name] = Array.isArray(value) ? value.join(", ") : value;
        }
      }
      headers["x-request-id"] = request.id;
      headers["x-real-ip"] = request.realIp;

      const clientGone = new AbortController();
      reply.raw.once("close", () => {
        if (!reply.raw.writableEnded) clientGone.abort();
      });

      let response: Response;
      let body: Buffer;
      try {
        response = await fetch(new URL(request.url, opt.sidecarUrl), {
          method: "GET",
          headers,
          redirect: "manual",
          signal: AbortSignal.any([AbortSignal.timeout(timeoutMs), clientGone.signal])
        });
        body = Buffer.from(await response.arrayBuffer());
      } catch (error) {
        if (clientGone.signal.aborted) return reply.status(499).send();
        const isTimeout = error instanceof Error && error.name === "TimeoutError";
        recordFallback(
          isTimeout ? "timeout" : "connection",
          route,
          request.id,
          error instanceof Error ? error.name : undefined
        );
        return undefined;
      }

      if (response.status >= 500) {
        recordFallback("5xx", route, request.id, String(response.status));
        return undefined;
      }

      response.headers.forEach((value, name) => {
        if (!RESPONSE_SKIPPED_HEADERS.has(name) && name !== "set-cookie") void reply.header(name, value);
      });
      const cookies = response.headers.getSetCookie();
      if (cookies.length) void reply.header("set-cookie", cookies);
      return reply.status(response.status).send(body);
    });
  }
);
