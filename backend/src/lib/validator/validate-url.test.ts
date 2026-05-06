/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument */
import type { AgentOptions as HttpAgentOptions } from "node:http";
import type { Agent as HttpsAgent } from "node:https";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  blockLocalAndPrivateIpAddresses,
  buildSsrfSafeAgent,
  isFQDN,
  safeRequest,
  ssrfSafeGet,
  validateSsrfUrl
} from "./validate-url";

type MockedRequestFn = (config: unknown) => Promise<{
  data: unknown;
  status: number;
  headers: Record<string, unknown>;
}>;

// `vi.mock` factories run in a hoisted scope before normal `const` init — any
// `vi.fn` / state they close over must come from `vi.hoisted`.
const { lookupMock, configState, verifyHostInputValidityMock, requestRequestMock } = vi.hoisted(() => {
  const lookup = vi.fn<(hostname: string, opts: { all?: boolean }) => Promise<{ address: string; family: 4 | 6 }[]>>();

  const config = {
    isDevelopmentMode: false,
    ALLOW_INTERNAL_IP_CONNECTIONS: false,
    SITE_URL: "https://infisical.example",
    REDIS_URL: "redis://internal-redis:6379",
    DB_HOST: "internal-db",
    isHsmConfigured: false
  };

  const verifyHost = vi.fn(async () => undefined);

  const requestReq = vi.fn<MockedRequestFn>(async () => ({
    data: undefined,
    status: 200,
    headers: {}
  }));

  return {
    lookupMock: lookup,
    configState: config,
    verifyHostInputValidityMock: verifyHost,
    requestRequestMock: requestReq
  };
});

vi.mock("node:dns/promises", () => ({
  default: { lookup: (...args: unknown[]) => (lookupMock as any)(...args) },
  lookup: (...args: unknown[]) => (lookupMock as any)(...args)
}));

vi.mock("@app/lib/config/env", () => ({
  getConfig: () => configState
}));

vi.mock("@app/ee/services/dynamic-secret/dynamic-secret-fns", () => ({
  verifyHostInputValidity: verifyHostInputValidityMock
}));

vi.mock("@app/lib/config/request", () => ({
  request: { request: (...args: unknown[]) => (requestRequestMock as any)(...args) }
}));

const PUBLIC_IP_V4 = "8.8.8.8";
const PUBLIC_IP_V4_ALT = "1.1.1.1";
const PRIVATE_IP_V4 = "10.0.0.1";
const LOOPBACK_IP_V4 = "127.0.0.1";
const PUBLIC_IP_V6 = "2606:4700::1";

const setLookup = (entries: { address: string; family: 4 | 6 }[]) => {
  lookupMock.mockReset();
  lookupMock.mockResolvedValue(entries);
};

const lastRequestArgs = () => {
  const { calls } = requestRequestMock.mock;
  return calls[calls.length - 1]?.[0] as Record<string, any>;
};

describe("validate-url SSRF helpers", () => {
  beforeEach(() => {
    configState.isDevelopmentMode = false;
    configState.ALLOW_INTERNAL_IP_CONNECTIONS = false;
    requestRequestMock.mockReset();
    requestRequestMock.mockResolvedValue({ data: undefined, status: 200, headers: {} });
    verifyHostInputValidityMock.mockReset();
    verifyHostInputValidityMock.mockResolvedValue(undefined);
    setLookup([{ address: PUBLIC_IP_V4, family: 4 }]);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("validateSsrfUrl", () => {
    it("returns undefined when allowPrivateIps is true (no validation, no pinning)", async () => {
      const result = await validateSsrfUrl("http://10.0.0.1/whatever", { allowPrivateIps: true });
      expect(result).toBeUndefined();
      expect(lookupMock).not.toHaveBeenCalled();
      expect(verifyHostInputValidityMock).not.toHaveBeenCalled();
    });

    it("returns undefined in development mode (escape hatch for local dev)", async () => {
      configState.isDevelopmentMode = true;
      const result = await validateSsrfUrl("https://example.com");
      expect(result).toBeUndefined();
    });

    it("rejects URLs with embedded user credentials", async () => {
      await expect(validateSsrfUrl("https://user:pass@example.com")).rejects.toThrow(/user credentials/i);
    });

    it("rejects literal `localhost` hostnames", async () => {
      await expect(validateSsrfUrl("http://localhost:8080")).rejects.toThrow(/Local IPs not allowed/i);
    });

    it("rejects literal `host.docker.internal` hostnames", async () => {
      await expect(validateSsrfUrl("http://host.docker.internal")).rejects.toThrow(/Local IPs not allowed/i);
    });

    it("rejects RFC1918 / loopback IPs by default", async () => {
      setLookup([{ address: PRIVATE_IP_V4, family: 4 }]);
      await expect(validateSsrfUrl("https://example.com")).rejects.toThrow(/Local IPs not allowed/i);
    });

    it("rejects loopback IPv4 even when configured as a literal IP", async () => {
      await expect(validateSsrfUrl(`http://${LOOPBACK_IP_V4}`)).rejects.toThrow(/Local IPs not allowed/i);
      // Literal IPs must NOT trigger DNS lookup.
      expect(lookupMock).not.toHaveBeenCalled();
    });

    it("allows private IPs when ALLOW_INTERNAL_IP_CONNECTIONS is true", async () => {
      configState.ALLOW_INTERNAL_IP_CONNECTIONS = true;
      setLookup([{ address: PRIVATE_IP_V4, family: 4 }]);
      const result = await validateSsrfUrl("https://internal.example");
      expect(result).toEqual({
        hostname: "internal.example",
        entries: [{ address: PRIVATE_IP_V4, family: 4 }]
      });
    });

    it("invokes verifyHostInputValidity to block Infisical-internal hosts (DB/Redis)", async () => {
      verifyHostInputValidityMock.mockRejectedValueOnce(new Error("blocked: internal infra"));
      await expect(validateSsrfUrl("https://internal-db.example")).rejects.toThrow(/internal infra/i);
    });

    it("returns the resolved IPs on success so the caller can pin to them", async () => {
      setLookup([
        { address: PUBLIC_IP_V4, family: 4 },
        { address: PUBLIC_IP_V4_ALT, family: 4 }
      ]);
      const result = await validateSsrfUrl("https://example.com");
      expect(result?.hostname).toBe("example.com");
      expect(result?.entries).toEqual([
        { address: PUBLIC_IP_V4, family: 4 },
        { address: PUBLIC_IP_V4_ALT, family: 4 }
      ]);
    });

    it("throws when DNS returns no addresses", async () => {
      setLookup([]);
      await expect(validateSsrfUrl("https://example.com")).rejects.toThrow(/Could not resolve hostname/i);
    });
  });

  describe("buildSsrfSafeAgent / pinned lookup", () => {
    it("returns undefined when nothing needs customization (dev mode + no TLS opts + no agent customization)", async () => {
      configState.isDevelopmentMode = true;
      const agent = await buildSsrfSafeAgent("https://example.com");
      expect(agent).toBeUndefined();
    });

    it("returns an https.Agent with a pinned `lookup` for HTTPS targets", async () => {
      const agent = await buildSsrfSafeAgent("https://example.com");
      expect(agent).toBeDefined();
      const opts = (agent as HttpsAgent).options;
      expect(typeof opts.lookup).toBe("function");
      expect(opts.keepAlive).toBe(false);
    });

    it("returns an http.Agent for HTTP targets", async () => {
      const agent = await buildSsrfSafeAgent("http://example.com");
      expect(agent).toBeDefined();
      const opts = (agent as unknown as { options: HttpAgentOptions }).options;
      expect(typeof opts.lookup).toBe("function");
    });

    it("propagates ca / rejectUnauthorized / servername / keepAlive / checkServerIdentity to https.Agent", async () => {
      const checkServerIdentity = () => undefined;
      const agent = await buildSsrfSafeAgent("https://example.com", {
        ca: "-----BEGIN CERTIFICATE-----",
        rejectUnauthorized: false,
        servername: "alt.example.com",
        keepAlive: true,
        checkServerIdentity
      });
      const opts = (agent as HttpsAgent).options;
      expect(opts.ca).toBe("-----BEGIN CERTIFICATE-----");
      expect(opts.rejectUnauthorized).toBe(false);
      expect(opts.servername).toBe("alt.example.com");
      expect(opts.keepAlive).toBe(true);
      expect(opts.checkServerIdentity).toBe(checkServerIdentity);
    });

    describe("pinned lookup function", () => {
      const getLookup = async (entries: { address: string; family: 4 | 6 }[]) => {
        setLookup(entries);
        const agent = await buildSsrfSafeAgent("https://example.com");
        const opts = (agent as HttpsAgent).options;
        return opts.lookup as unknown as (
          hostname: string,
          optionsOrCb: { all?: boolean; family?: number } | ((...args: any[]) => void),
          cb?: (...args: any[]) => void
        ) => void;
      };

      it("supports the 2-arg `lookup(hostname, callback)` form", async () => {
        const lookup = await getLookup([
          { address: PUBLIC_IP_V4, family: 4 },
          { address: PUBLIC_IP_V4_ALT, family: 4 }
        ]);
        const result: { err: Error | null; address: string; family: number } = await new Promise((resolve) => {
          lookup("example.com", (err, address, family) => resolve({ err, address, family }));
        });
        expect(result.err).toBeNull();
        expect(result.address).toBe(PUBLIC_IP_V4);
        expect(result.family).toBe(4);
      });

      it("supports the 3-arg `lookup(hostname, options, callback)` form", async () => {
        const lookup = await getLookup([{ address: PUBLIC_IP_V4, family: 4 }]);
        const result: { err: Error | null; address: string; family: number } = await new Promise((resolve) => {
          lookup("example.com", {}, (err: Error | null, address: string, family: number) =>
            resolve({ err, address, family })
          );
        });
        expect(result.err).toBeNull();
        expect(result.address).toBe(PUBLIC_IP_V4);
      });

      it("returns ALL pre-validated entries when `all: true`", async () => {
        const entries = [
          { address: PUBLIC_IP_V4, family: 4 as const },
          { address: PUBLIC_IP_V4_ALT, family: 4 as const }
        ];
        const lookup = await getLookup(entries);
        const result: { err: Error | null; addresses: { address: string; family: number }[] } = await new Promise(
          (resolve) => {
            lookup(
              "example.com",
              { all: true },
              (err: Error | null, addresses: { address: string; family: number }[]) => resolve({ err, addresses })
            );
          }
        );
        expect(result.err).toBeNull();
        expect(result.addresses).toEqual(entries);
      });

      it("filters entries by requested family", async () => {
        const lookup = await getLookup([
          { address: PUBLIC_IP_V4, family: 4 },
          { address: PUBLIC_IP_V6, family: 6 }
        ]);
        const result: { err: Error | null; address: string; family: number } = await new Promise((resolve) => {
          lookup("example.com", { family: 6 }, (err: Error | null, address: string, family: number) =>
            resolve({ err, address, family })
          );
        });
        expect(result.err).toBeNull();
        expect(result.address).toBe(PUBLIC_IP_V6);
        expect(result.family).toBe(6);
      });

      it("returns ENOTFOUND when the requested family cannot be satisfied (no silent fallback)", async () => {
        const lookup = await getLookup([{ address: PUBLIC_IP_V4, family: 4 }]);
        const result: { err: any; address: string; family: number } = await new Promise((resolve) => {
          lookup("example.com", { family: 6 }, (err: any, address: string, family: number) =>
            resolve({ err, address, family })
          );
        });
        expect(result.err).toBeTruthy();
        expect(result.err.code).toBe("ENOTFOUND");
        expect(result.err.hostname).toBe("example.com");
      });
    });
  });

  describe("safeRequest dispatch", () => {
    it("validates the URL, builds a pinned agent, and forwards to the underlying axios with maxRedirects:0", async () => {
      requestRequestMock.mockResolvedValueOnce({ data: { ok: true }, status: 200, headers: {} });
      const result = await safeRequest.get<{ ok: boolean }>("https://example.com/path", { headers: { "x-test": "1" } });
      expect(result.data).toEqual({ ok: true });

      const args = lastRequestArgs();
      expect(args.method).toBe("GET");
      expect(args.url).toBe("https://example.com/path");
      expect(args.maxRedirects).toBe(0);
      expect(args.headers).toEqual({ "x-test": "1" });
      expect(args.httpsAgent).toBeDefined();
      expect(args.httpAgent).toBeUndefined();
    });

    it("attaches httpAgent (not httpsAgent) for HTTP URLs", async () => {
      requestRequestMock.mockResolvedValueOnce({ data: undefined, status: 204, headers: {} });
      await safeRequest.post("http://example.com/p", { x: 1 });
      const args = lastRequestArgs();
      expect(args.httpsAgent).toBeUndefined();
      expect(args.httpAgent).toBeDefined();
    });

    it("plumbs validateStatus through dispatch", async () => {
      requestRequestMock.mockResolvedValueOnce({ data: undefined, status: 401, headers: {} });
      const validateStatus = (s: number) => s < 500;
      await safeRequest.get("https://example.com", { validateStatus });
      const args = lastRequestArgs();
      expect(args.validateStatus).toBe(validateStatus);
    });

    it("skips agent customization when nothing needs it (dev mode + no TLS opts)", async () => {
      configState.isDevelopmentMode = true;
      requestRequestMock.mockResolvedValueOnce({ data: undefined, status: 200, headers: {} });
      await safeRequest.get("https://example.com");
      const args = lastRequestArgs();
      expect(args.httpsAgent).toBeUndefined();
      expect(args.httpAgent).toBeUndefined();
    });

    it("forwards safeRequest.put / patch / delete with the right method", async () => {
      requestRequestMock.mockResolvedValue({ data: undefined, status: 200, headers: {} });
      await safeRequest.put("https://example.com", { a: 1 });
      expect(lastRequestArgs().method).toBe("PUT");
      await safeRequest.patch("https://example.com", { a: 1 });
      expect(lastRequestArgs().method).toBe("PATCH");
      await safeRequest.delete("https://example.com");
      expect(lastRequestArgs().method).toBe("DELETE");
    });

    it("safeRequest.delete preserves options.data (Axios DELETE-with-body)", async () => {
      requestRequestMock.mockResolvedValue({ data: undefined, status: 200, headers: {} });
      const body = { workspaceId: "w-1", environment: "prod", secretPath: "/", secrets: [{ secretKey: "K" }] };
      await safeRequest.delete("https://example.com/v3/secrets/batch/raw", {
        headers: { Authorization: "Bearer t" },
        data: body
      });
      const args = lastRequestArgs();
      expect(args.method).toBe("DELETE");
      expect(args.data).toEqual(body);
      expect(args.headers).toEqual({ Authorization: "Bearer t" });
    });

    it("safeRequest.get preserves options.data (Axios GET-with-body, unusual but legal)", async () => {
      requestRequestMock.mockResolvedValue({ data: undefined, status: 200, headers: {} });
      const body = { query: "x" };
      await safeRequest.get("https://example.com/search", { data: body });
      const args = lastRequestArgs();
      expect(args.method).toBe("GET");
      expect(args.data).toEqual(body);
    });

    it("positional body wins over options.data for post/put/patch (matches Axios)", async () => {
      requestRequestMock.mockResolvedValue({ data: undefined, status: 200, headers: {} });
      const positional = { positional: true };
      const optionsData = { positional: false };
      await safeRequest.post("https://example.com", positional, { data: optionsData } as any);
      expect(lastRequestArgs().data).toEqual(positional);
      await safeRequest.put("https://example.com", positional, { data: optionsData } as any);
      expect(lastRequestArgs().data).toEqual(positional);
      await safeRequest.patch("https://example.com", positional, { data: optionsData } as any);
      expect(lastRequestArgs().data).toEqual(positional);
    });

    it("safeRequest.request validates absolute `url` even when baseURL is set (Axios-compatible)", async () => {
      requestRequestMock.mockResolvedValueOnce({ data: undefined, status: 200, headers: {} });
      await safeRequest.request({
        url: "https://example.com/v1/items",
        method: "GET",
        baseURL: "https://attacker.example"
      });
      // Axios uses the absolute URL when one is provided; we must validate the
      // exact URL Axios will request — `https://example.com/v1/items`, NOT
      // a `new URL("/v1/items", baseURL)` recombination.
      expect(lookupMock).toHaveBeenCalledWith("example.com", expect.any(Object));
      expect(lookupMock).not.toHaveBeenCalledWith("attacker.example", expect.any(Object));
    });

    it("safeRequest.request validates the combined URL when `url` is relative and baseURL is set", async () => {
      requestRequestMock.mockResolvedValueOnce({ data: undefined, status: 200, headers: {} });
      await safeRequest.request({
        url: "/v1/items",
        method: "GET",
        baseURL: "https://example.com/api"
      });
      // Axios path-joins baseURL + url; we must do the same so the URL we
      // SSRF-validate is the URL Axios actually requests.
      expect(lookupMock).toHaveBeenCalledWith("example.com", expect.any(Object));
    });
  });

  describe("ssrfSafeGet redirects", () => {
    it("follows up to MAX_SAFE_REDIRECTS hops, validating each hop", async () => {
      requestRequestMock
        .mockResolvedValueOnce({ data: undefined, status: 302, headers: { location: "https://hop1.example/" } })
        .mockResolvedValueOnce({ data: undefined, status: 302, headers: { location: "https://hop2.example/" } })
        .mockResolvedValueOnce({ data: { final: true }, status: 200, headers: {} });
      setLookup([{ address: PUBLIC_IP_V4, family: 4 }]);

      const res = await ssrfSafeGet<{ final: boolean }>("https://start.example");
      expect(res.data).toEqual({ final: true });
      expect(requestRequestMock.mock.calls.length).toBe(3);
      expect(lookupMock.mock.calls.map((c) => c[0])).toEqual(["start.example", "hop1.example", "hop2.example"]);
    });

    it("rejects redirects to private IPs", async () => {
      requestRequestMock
        .mockResolvedValueOnce({ data: undefined, status: 302, headers: { location: "https://internal.example/" } })
        .mockResolvedValueOnce({ data: undefined, status: 200, headers: {} });
      lookupMock.mockReset();
      lookupMock
        .mockResolvedValueOnce([{ address: PUBLIC_IP_V4, family: 4 }])
        .mockResolvedValueOnce([{ address: PRIVATE_IP_V4, family: 4 }]);

      await expect(ssrfSafeGet("https://start.example")).rejects.toThrow(/Local IPs not allowed/i);
    });

    it("resolves relative `Location` headers against the previous hop", async () => {
      requestRequestMock
        .mockResolvedValueOnce({ data: undefined, status: 301, headers: { location: "/relative" } })
        .mockResolvedValueOnce({ data: { ok: true }, status: 200, headers: {} });
      const res = await ssrfSafeGet<{ ok: boolean }>("https://start.example/initial");
      expect(res.data).toEqual({ ok: true });
      // Second call should hit the resolved absolute URL.
      const secondCallUrl = (requestRequestMock.mock.calls[1]?.[0] as { url: string }).url;
      expect(secondCallUrl).toBe("https://start.example/relative");
    });

    it("throws when a redirect response is missing the Location header", async () => {
      requestRequestMock.mockResolvedValueOnce({ data: undefined, status: 302, headers: {} });
      await expect(ssrfSafeGet("https://start.example")).rejects.toThrow(/missing Location header/i);
    });

    it("throws after exceeding MAX_SAFE_REDIRECTS", async () => {
      const redirectResp = { data: undefined, status: 302, headers: { location: "https://next.example/" } };
      // Exceed 5 redirects.
      requestRequestMock.mockResolvedValue(redirectResp);
      await expect(ssrfSafeGet("https://start.example")).rejects.toThrow(/Too many redirects/i);
    });
  });

  describe("blockLocalAndPrivateIpAddresses (legacy helper)", () => {
    it("is a no-op in dev mode", async () => {
      configState.isDevelopmentMode = true;
      const result = await blockLocalAndPrivateIpAddresses("https://attacker.localhost");
      expect(result).toBeUndefined();
      expect(lookupMock).not.toHaveBeenCalled();
    });

    it("is a no-op when invoked via gateway (callers explicitly opt out)", async () => {
      const result = await blockLocalAndPrivateIpAddresses("https://attacker.localhost", true);
      expect(result).toBeUndefined();
    });

    it("returns the resolved entries on success", async () => {
      setLookup([{ address: PUBLIC_IP_V4, family: 4 }]);
      const result = await blockLocalAndPrivateIpAddresses("https://example.com");
      expect(result).toEqual({ hostname: "example.com", entries: [{ address: PUBLIC_IP_V4, family: 4 }] });
    });
  });
});

describe("isFQDN", () => {
  it("Non wildcard", () => {
    expect(isFQDN("www.example.com")).toBeTruthy();
  });

  it("Wildcard", () => {
    expect(isFQDN("*.example.com", { allow_wildcard: true })).toBeTruthy();
  });

  it("Wildcard FQDN fails on option allow_wildcard false", () => {
    expect(isFQDN("*.example.com")).toBeFalsy();
  });
});
