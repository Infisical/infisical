import { Readable } from "node:stream";

import { safeRequest } from "@app/lib/validator";

export type TOauthHttpResponse = {
  status: number;
  contentType: string;
  body: string;
};

// Narrow on purpose, so the OAuth fns are tested against stubbed servers without a network.
export type TOauthHttpClient = {
  get: (url: string) => Promise<TOauthHttpResponse>;
  postForm: (
    url: string,
    form: URLSearchParams,
    headers?: Record<string, string>,
    options?: { timeoutMs?: number }
  ) => Promise<TOauthHttpResponse>;
  postJson: (url: string, body: unknown) => Promise<TOauthHttpResponse>;
  // An unauthenticated MCP request, for the `WWW-Authenticate` challenge only. The body is never read.
  probe: (url: string) => Promise<{ status: number; wwwAuthenticate: string | null }>;
};

const TIMEOUT_MS = 10_000;

// Also bounds what the HTTP client's own timeout doesn't cover, such as resolving and validating the host.
export const withTimeout = <T>(promise: Promise<T>, ms: number) => {
  let timer: NodeJS.Timeout | undefined;
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("OAuth request timed out")), ms);
    })
  ]).finally(() => clearTimeout(timer));
};
const MAX_BODY_BYTES = 1024 * 1024;

const headerValue = (value: unknown): string => {
  if (Array.isArray(value)) return value.join(", ");
  return typeof value === "string" ? value : "";
};

// Redirects are never followed (safeRequest pins maxRedirects to 0), so a metadata URL or token endpoint can't
// bounce a request carrying a code or a client secret to another host.
export const agentVaultOauthHttpClient: TOauthHttpClient = {
  get: async (url) => {
    const response = await safeRequest.get<string>(url, {
      timeout: TIMEOUT_MS,
      signal: AbortSignal.timeout(TIMEOUT_MS),
      maxContentLength: MAX_BODY_BYTES,
      responseType: "text",
      transformResponse: (data: string) => data,
      validateStatus: () => true,
      headers: { Accept: "application/json" }
    });
    return {
      status: response.status,
      contentType: headerValue(response.headers["content-type"]),
      body: response.data ?? ""
    };
  },
  postForm: async (url, form, headers = {}, options = {}) => {
    const timeoutMs = Math.max(1, Math.min(options.timeoutMs ?? TIMEOUT_MS, TIMEOUT_MS));
    const response = await safeRequest.post<string>(url, form.toString(), {
      timeout: timeoutMs,
      "axios-retry": { retries: 0 },
      // axios's timeout restarts on socket activity, so a server trickling bytes could outlast it.
      signal: AbortSignal.timeout(timeoutMs),
      maxContentLength: MAX_BODY_BYTES,
      responseType: "text",
      transformResponse: (data: string) => data,
      validateStatus: () => true,
      headers: { ...headers, Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" }
    });
    return {
      status: response.status,
      contentType: headerValue(response.headers["content-type"]),
      body: response.data ?? ""
    };
  },
  postJson: async (url, body) => {
    const response = await safeRequest.post<string>(url, JSON.stringify(body), {
      timeout: TIMEOUT_MS,
      signal: AbortSignal.timeout(TIMEOUT_MS),
      "axios-retry": { retries: 0 },
      maxContentLength: MAX_BODY_BYTES,
      responseType: "text",
      transformResponse: (data: string) => data,
      validateStatus: () => true,
      headers: { Accept: "application/json", "Content-Type": "application/json" }
    });
    return {
      status: response.status,
      contentType: headerValue(response.headers["content-type"]),
      body: response.data ?? ""
    };
  },
  probe: async (url) => {
    const response = await safeRequest.post<Readable>(
      url,
      JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-06-18",
          capabilities: {},
          clientInfo: { name: "Infisical Agent Vault", version: "1.0.0" }
        }
      }),
      {
        timeout: TIMEOUT_MS,
        signal: AbortSignal.timeout(TIMEOUT_MS),
        "axios-retry": { retries: 0 },
        // A server that needs no auth answers with a stream that may never end, so the body is dropped unread.
        responseType: "stream",
        validateStatus: () => true,
        headers: { Accept: "application/json, text/event-stream", "Content-Type": "application/json" }
      }
    );
    response.data?.destroy?.();
    const challenge = headerValue(response.headers["www-authenticate"]);
    if (challenge || (response.status >= 200 && response.status < 300)) {
      return { status: response.status, wwwAuthenticate: challenge || null };
    }

    // An SSE server may only challenge the GET that opens its stream, and answer the POST with 405.
    const sse = await safeRequest
      .get<Readable>(url, {
        timeout: TIMEOUT_MS,
        signal: AbortSignal.timeout(TIMEOUT_MS),
        "axios-retry": { retries: 0 },
        responseType: "stream",
        validateStatus: () => true,
        headers: { Accept: "text/event-stream" }
      })
      .catch(() => null);
    if (sse) {
      sse.data?.destroy?.();
      const sseChallenge = headerValue(sse.headers["www-authenticate"]);
      if (sseChallenge) return { status: sse.status, wwwAuthenticate: sseChallenge };
    }
    return { status: response.status, wwwAuthenticate: null };
  }
};
