import http, { type IncomingHttpHeaders } from "node:http";
import https from "node:https";

import { BadRequestError } from "@app/lib/errors";

import {
  buildUpstreamRequestHeaders,
  rewriteHtmlForProxy,
  rewriteLocationForProxy,
  serializeCookieJar,
  updateCookieJar
} from "./pam-web-server-proxy-fns";
import type { TPamWebServerBrowserSession } from "./pam-web-server-session-manager";

const MAX_PROXY_RESPONSE_BYTES = 10 * 1024 * 1024;
const PROXY_REQUEST_TIMEOUT_MS = 30_000;
const RESPONSE_HEADERS = new Set([
  "accept-ranges",
  "cache-control",
  "content-disposition",
  "content-language",
  "content-type",
  "etag",
  "expires",
  "last-modified"
]);

export type TPamWebServerProxyResponse = {
  statusCode: number;
  headers: Record<string, string | string[]>;
  body: Buffer;
};

const serializeRequestBody = (body: unknown, contentType?: string): Buffer | undefined => {
  if (body === undefined || body === null) return undefined;
  if (Buffer.isBuffer(body)) return body;
  if (typeof body === "string") return Buffer.from(body);
  if (contentType?.includes("application/x-www-form-urlencoded") && typeof body === "object") {
    const params = new URLSearchParams();
    Object.entries(body as Record<string, unknown>).forEach(([key, value]) => {
      if (value !== undefined && value !== null) params.append(key, String(value));
    });
    return Buffer.from(params.toString());
  }
  return Buffer.from(JSON.stringify(body));
};

export const proxyPamWebServerRequest = async ({
  session,
  method,
  upstreamPath,
  requestHeaders,
  body,
  proxyBasePath
}: {
  session: TPamWebServerBrowserSession;
  method: string;
  upstreamPath: string;
  requestHeaders: IncomingHttpHeaders;
  body: unknown;
  proxyBasePath: string;
}): Promise<TPamWebServerProxyResponse> => {
  const contentType = typeof requestHeaders["content-type"] === "string" ? requestHeaders["content-type"] : undefined;
  const serializedBody = serializeRequestBody(body, contentType);
  const headers = buildUpstreamRequestHeaders({
    requestHeaders,
    targetHost: session.upstreamUrl.host,
    authorization: session.authorization,
    upstreamCookie: serializeCookieJar(session.cookieJar) || undefined
  });
  if (serializedBody) headers["content-length"] = String(serializedBody.byteLength);

  const requestFn = session.upstreamUrl.protocol === "https:" ? https.request : http.request;

  return new Promise((resolve, reject) => {
    const request = requestFn(
      {
        host: "127.0.0.1",
        port: session.relayPort,
        method,
        path: upstreamPath,
        headers,
        ...(session.upstreamUrl.protocol === "https:"
          ? { servername: session.upstreamUrl.hostname, rejectUnauthorized: true }
          : {})
      },
      (response) => {
        const chunks: Buffer[] = [];
        let totalBytes = 0;

        response.on("data", (chunk: Buffer) => {
          totalBytes += chunk.byteLength;
          if (totalBytes > MAX_PROXY_RESPONSE_BYTES) {
            response.destroy(
              new BadRequestError({ message: "The Web Server response is too large to display in browser access." })
            );
            return;
          }
          chunks.push(chunk);
        });

        response.on("error", reject);
        response.on("end", () => {
          updateCookieJar(session.cookieJar, response.headers["set-cookie"]);

          const responseHeaders: Record<string, string | string[]> = {};
          Object.entries(response.headers).forEach(([key, value]) => {
            if (!RESPONSE_HEADERS.has(key) || value === undefined) return;
            responseHeaders[key] = value;
          });

          const statusCode = response.statusCode ?? 502;
          const { location } = response.headers;
          if (location && statusCode >= 300 && statusCode < 400) {
            const rewrittenLocation = rewriteLocationForProxy({
              location,
              targetOrigin: session.upstreamUrl.origin,
              proxyBasePath
            });
            if (!rewrittenLocation) {
              resolve({
                statusCode: 502,
                headers: { "content-type": "text/plain; charset=utf-8" },
                body: Buffer.from("Cross-origin redirects are not supported by this browser access prototype.")
              });
              return;
            }
            responseHeaders.location = rewrittenLocation;
          }

          let responseBody = Buffer.concat(chunks);
          const responseContentType = response.headers["content-type"];
          if (responseContentType?.includes("text/html")) {
            responseBody = Buffer.from(rewriteHtmlForProxy(responseBody.toString("utf8"), proxyBasePath));
          }

          resolve({ statusCode, headers: responseHeaders, body: responseBody });
        });
      }
    );

    request.setTimeout(PROXY_REQUEST_TIMEOUT_MS, () => {
      request.destroy(new BadRequestError({ message: "The Web Server did not respond before the request timed out." }));
    });
    request.on("error", reject);
    if (serializedBody) request.write(serializedBody);
    request.end();
  });
};
