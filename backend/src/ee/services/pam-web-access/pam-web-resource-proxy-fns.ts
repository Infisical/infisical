import type { IncomingHttpHeaders, OutgoingHttpHeaders } from "node:http";
import net from "node:net";

import type { TPamSessions } from "@app/db/schemas";
import { crypto } from "@app/lib/crypto";
import { BadRequestError, ForbiddenRequestError, NotFoundError } from "@app/lib/errors";

import { PamAccessMethod, PamAccountType, PamSessionStatus } from "../pam/pam-enums";
import { TParsedWebResourceUrl } from "../pam-account/pam-account-schemas";

export const WEB_RESOURCE_BODY_LIMIT_BYTES = 1024 * 1024;
export const WEB_RESOURCE_RESPONSE_LIMIT_BYTES = 5 * 1024 * 1024;
export const WEB_RESOURCE_TOKEN_QUERY_PARAM = "t";
export const WEB_RESOURCE_TOKEN_COOKIE_PREFIX = "infisical_pam_web_resource";

const WEB_RESOURCE_TOKEN_TYPE = "pam-web-resource-session";
const WEB_RESOURCE_TOKEN_AUDIENCE = "pam-web-resource-proxy";

export type TWebResourceProxyContext = TParsedWebResourceUrl & {
  proxyPrefix: string;
};

type TWebResourceTokenClaims = {
  tokenType: typeof WEB_RESOURCE_TOKEN_TYPE;
  sessionId: string;
  accountId: string;
  projectId: string;
  userId: string;
  iat?: number;
  exp?: number;
  aud?: string;
  sub?: string;
};

const HOP_BY_HOP_HEADERS = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade"
]);

const STRIPPED_UPSTREAM_REQUEST_HEADERS = new Set([
  ...HOP_BY_HOP_HEADERS,
  "accept-encoding",
  "authorization",
  "cookie",
  "host",
  "origin",
  "referer",
  "x-csrf-token",
  "x-xsrf-token",
  "x-infisical-csrf-token"
]);

const STRIPPED_DOWNSTREAM_RESPONSE_HEADERS = new Set([
  ...HOP_BY_HOP_HEADERS,
  "content-security-policy",
  "content-security-policy-report-only",
  "cross-origin-embedder-policy",
  "cross-origin-opener-policy",
  "cross-origin-resource-policy",
  "permissions-policy",
  "set-cookie",
  "x-frame-options"
]);

export const getWebResourceProxyPrefix = (accountId: string, sessionId: string) =>
  `/api/v1/pam/accounts/${accountId}/web-resource-sessions/${sessionId}`;

export const getWebResourceTokenCookieName = (sessionId: string) =>
  `${WEB_RESOURCE_TOKEN_COOKIE_PREFIX}_${sessionId.replace(/-/g, "")}`;

export const headerValueToString = (value: string | string[] | undefined) => {
  if (Array.isArray(value)) return value.join(", ");
  return value;
};

export const getTargetHostHeader = ({ host, port }: Pick<TParsedWebResourceUrl, "host" | "port">) => {
  const formattedHost = net.isIP(host) === 6 ? `[${host}]` : host;
  return `${formattedHost}:${port}`;
};

export const buildQueryString = (query: Record<string, unknown>) => {
  const params = new URLSearchParams();
  Object.entries(query).forEach(([key, value]) => {
    if (key === WEB_RESOURCE_TOKEN_QUERY_PARAM || value === undefined || value === null) return;
    if (Array.isArray(value)) {
      value.forEach((item) => params.append(key, String(item)));
      return;
    }
    params.append(key, String(value));
  });
  const encoded = params.toString();
  return encoded ? `?${encoded}` : "";
};

export const normalizeProxyPath = (path: string) => {
  const normalized = path ? `/${path.replace(/^\/+/, "")}` : "/";
  return normalized === "/" ? "/" : normalized;
};

export const stripTargetBasePath = (basePath: string, targetPath: string) => {
  if (basePath === "/") return targetPath || "/";
  if (targetPath === basePath) return "/";
  if (targetPath.startsWith(`${basePath}/`)) return targetPath.slice(basePath.length) || "/";
  return targetPath || "/";
};

export const toProxyUrlPath = (context: TWebResourceProxyContext, targetPathWithQuery: string) => {
  const parsedPath = new URL(targetPathWithQuery || "/", "http://web-resource.local");
  const proxyPath = stripTargetBasePath(context.basePath, parsedPath.pathname);
  return `${context.proxyPrefix}${proxyPath}${parsedPath.search}`;
};

export const buildUpstreamPath = (
  context: Pick<TWebResourceProxyContext, "basePath">,
  path: string,
  query: Record<string, unknown>
) => {
  const proxyPath = normalizeProxyPath(path);
  const basePath = context.basePath === "/" ? "" : context.basePath.replace(/\/$/, "");
  return `${basePath}${proxyPath}${buildQueryString(query)}`;
};

export const buildUpstreamHeaders = (
  headers: IncomingHttpHeaders,
  target: Pick<TParsedWebResourceUrl, "host" | "port">,
  body?: Buffer
): OutgoingHttpHeaders => {
  const upstreamHeaders: OutgoingHttpHeaders = {};

  Object.entries(headers).forEach(([name, value]) => {
    const lowerName = name.toLowerCase();
    if (STRIPPED_UPSTREAM_REQUEST_HEADERS.has(lowerName) || lowerName.startsWith("x-infisical-")) {
      return;
    }
    if (lowerName === "content-length") return;
    upstreamHeaders[name] = value;
  });

  upstreamHeaders.host = getTargetHostHeader(target);
  if (body) {
    upstreamHeaders["content-length"] = body.length;
  }

  return upstreamHeaders;
};

export const buildWebResourceSecurityHeaders = (): Record<string, string> => ({
  "content-security-policy":
    "sandbox allow-forms allow-scripts; default-src 'self' data: blob:; script-src 'self' 'unsafe-inline' 'unsafe-eval' data: blob:; style-src 'self' 'unsafe-inline' data:; img-src 'self' data: blob:; font-src 'self' data:; media-src 'self' data: blob:; connect-src 'self'; frame-ancestors 'self'; base-uri 'none'; form-action 'self'",
  "referrer-policy": "no-referrer",
  "x-content-type-options": "nosniff"
});

export const filterResponseHeaders = (
  headers: IncomingHttpHeaders,
  context: TWebResourceProxyContext
): Record<string, string | string[]> => {
  const responseHeaders: Record<string, string | string[]> = {};
  Object.entries(headers).forEach(([name, value]) => {
    const lowerName = name.toLowerCase();
    if (STRIPPED_DOWNSTREAM_RESPONSE_HEADERS.has(lowerName)) return;
    if (value === undefined) return;

    if (lowerName === "location") {
      const location = headerValueToString(value);
      if (!location) return;
      if (location.startsWith("/")) {
        responseHeaders[name] = toProxyUrlPath(context, location);
        return;
      }

      try {
        const parsed = new URL(location);
        if (
          parsed.protocol.replace(":", "") === context.scheme &&
          parsed.hostname.replace(/^\[/, "").replace(/\]$/, "") === context.host &&
          Number(parsed.port || (context.scheme === "http" ? 80 : 443)) === context.port
        ) {
          responseHeaders[name] = toProxyUrlPath(context, `${parsed.pathname}${parsed.search}`);
        }
      } catch {
        responseHeaders[name] = location;
      }
      return;
    }

    responseHeaders[name] = value;
  });

  return {
    ...responseHeaders,
    ...buildWebResourceSecurityHeaders()
  };
};

export const rewriteProxyHtml = (
  body: Buffer,
  headers: Record<string, string | string[]>,
  context: TWebResourceProxyContext
) => {
  const contentType = headerValueToString(headers["content-type"] ?? headers["Content-Type"]);
  if (!contentType?.toLowerCase().includes("text/html")) return body;

  const html = body.toString("utf-8");
  return Buffer.from(
    html.replace(/\b(href|src|action)=(["'])\/(?!\/)([^"']*)\2/gi, (_match, attr, quote, path) => {
      return `${attr}=${quote}${toProxyUrlPath(context, `/${path}`)}${quote}`;
    }),
    "utf-8"
  );
};

export const createWebResourceSessionToken = ({
  authSecret,
  sessionId,
  accountId,
  projectId,
  userId,
  expiresAt
}: {
  authSecret: string;
  sessionId: string;
  accountId: string;
  projectId: string;
  userId: string;
  expiresAt: Date;
}) => {
  const expiresIn = Math.max(1, Math.floor((expiresAt.getTime() - Date.now()) / 1000));
  return crypto.jwt().sign(
    {
      tokenType: WEB_RESOURCE_TOKEN_TYPE,
      sessionId,
      accountId,
      projectId,
      userId
    },
    authSecret,
    {
      audience: WEB_RESOURCE_TOKEN_AUDIENCE,
      expiresIn,
      subject: userId
    }
  );
};

export const verifyWebResourceSessionToken = ({
  authSecret,
  token,
  sessionId,
  accountId
}: {
  authSecret: string;
  token: string;
  sessionId: string;
  accountId: string;
}) => {
  let decoded: TWebResourceTokenClaims;
  try {
    decoded = crypto.jwt().verify(token, authSecret, {
      audience: WEB_RESOURCE_TOKEN_AUDIENCE
    }) as TWebResourceTokenClaims;
  } catch {
    throw new ForbiddenRequestError({ message: "Invalid web resource session token" });
  }

  if (
    decoded.tokenType !== WEB_RESOURCE_TOKEN_TYPE ||
    decoded.sessionId !== sessionId ||
    decoded.accountId !== accountId ||
    decoded.sub !== decoded.userId
  ) {
    throw new ForbiddenRequestError({ message: "Invalid web resource session token" });
  }

  return decoded;
};

export const assertWebResourceSessionCanProxy = ({
  session,
  accountId,
  sessionId,
  userId,
  now = new Date()
}: {
  session?: Pick<
    TPamSessions,
    "id" | "accountId" | "accountType" | "accessMethod" | "status" | "expiresAt" | "userId"
  > | null;
  accountId: string;
  sessionId: string;
  userId: string;
  now?: Date;
}) => {
  if (!session || session.id !== sessionId || session.accountId !== accountId) {
    throw new NotFoundError({ message: "Web resource session not found" });
  }

  if (session.userId !== userId) {
    throw new ForbiddenRequestError({ message: "Invalid web resource session token" });
  }

  if (session.accountType !== PamAccountType.WebResource || session.accessMethod !== PamAccessMethod.Web) {
    throw new BadRequestError({ message: "Session is not a web resource browser session" });
  }

  if (session.status !== PamSessionStatus.Active) {
    throw new BadRequestError({ message: "Web resource session is not active" });
  }

  return new Date(session.expiresAt).getTime() > now.getTime();
};
