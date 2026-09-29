import { createServer, Server } from "node:http";
import { AddressInfo } from "node:net";

import { AxiosError } from "axios";
import pino from "pino";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createRequestClient } from "../config/request";
import { loggerRedactPaths } from "./logger";

const BEARER_TOKEN = "eyJhbGciOiJSUzI1NiJ9.bearer-secret-payload.bearer-secret-signature";
const SIGNED_QUERY = "AccessKeyId=ak-secret-value&Signature=signature-secret-value";
const REDACTED = "[Redacted]";

const valueAt = (obj: unknown, path: string) =>
  path.split(".").reduce<unknown>((node, key) => (node as Record<string, unknown> | undefined)?.[key], obj);

const createTestLogger = () => {
  const lines: string[] = [];
  const testLogger = pino({ redact: loggerRedactPaths }, { write: (line: string) => lines.push(line) });
  return {
    testLogger,
    lastLine: () => ({ raw: lines[lines.length - 1], parsed: JSON.parse(lines[lines.length - 1]) as unknown })
  };
};

describe("logger redaction of outgoing request internals", () => {
  let server: Server;
  let axiosError: AxiosError;

  beforeAll(async () => {
    server = createServer((_req, res) => {
      res.writeHead(401, { "content-type": "application/json" });
      res.end(JSON.stringify({ kind: "Status", reason: "Unauthorized" }));
    });
    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", resolve);
    });
    const { port } = server.address() as AddressInfo;

    axiosError = await createRequestClient({}, { retries: 0 })
      .get(`http://127.0.0.1:${port}/apis/review?${SIGNED_QUERY}`, {
        headers: { Authorization: `Bearer ${BEARER_TOKEN}` }
      })
      .then(
        () => {
          throw new Error("expected the request to fail");
        },
        (err: AxiosError) => err
      );
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  it("gives the tests a real axios error that carries the raw header and signed path", () => {
    expect(valueAt(axiosError, "request._header")).toContain(`Bearer ${BEARER_TOKEN}`);
    expect(valueAt(axiosError, "request.path")).toContain(SIGNED_QUERY);
  });

  it("redacts the error logged directly (err.request and err.response.request)", () => {
    const { testLogger, lastLine } = createTestLogger();
    testLogger.error(axiosError, "request failed");
    const { raw, parsed } = lastLine();

    expect(raw).not.toContain(BEARER_TOKEN);
    expect(raw).not.toContain("signature-secret-value");
    expect(valueAt(parsed, "err.request._header")).toBe(REDACTED);
    expect(valueAt(parsed, "err.request.path")).toBe(REDACTED);
    expect(valueAt(parsed, "err.response.request._header")).toBe(REDACTED);
    expect(valueAt(parsed, "err.response.request.path")).toBe(REDACTED);
    expect(valueAt(parsed, "err.code")).toBe("ERR_BAD_REQUEST");
    expect(valueAt(parsed, "err.response.status")).toBe(401);
    expect(valueAt(parsed, "err.request.method")).toBe("GET");
    expect(valueAt(parsed, "err.request.host")).toBe("127.0.0.1");
  });

  it("redacts the response nested under a key", () => {
    const { testLogger, lastLine } = createTestLogger();
    testLogger.error({ response: axiosError.response }, "request failed");
    const { raw, parsed } = lastLine();

    expect(raw).not.toContain(BEARER_TOKEN);
    expect(raw).not.toContain("signature-secret-value");
    expect(valueAt(parsed, "response.request._header")).toBe(REDACTED);
    expect(valueAt(parsed, "response.request.path")).toBe(REDACTED);
    expect(valueAt(parsed, "response.status")).toBe(401);
    expect(valueAt(parsed, "response.data")).toEqual({ kind: "Status", reason: "Unauthorized" });
  });

  it("redacts the response logged as the root object", () => {
    const { testLogger, lastLine } = createTestLogger();
    testLogger.error(axiosError.response, "request failed");
    const { raw, parsed } = lastLine();

    expect(raw).not.toContain(BEARER_TOKEN);
    expect(raw).not.toContain("signature-secret-value");
    expect(valueAt(parsed, "request._header")).toBe(REDACTED);
    expect(valueAt(parsed, "request.path")).toBe(REDACTED);
    expect(valueAt(parsed, "status")).toBe(401);
  });

  it("redacts _header at the root", () => {
    const { testLogger, lastLine } = createTestLogger();
    testLogger.error({ _header: `Authorization: Bearer ${BEARER_TOKEN}`, method: "GET" }, "root");
    expect(lastLine().parsed).toMatchObject({ _header: REDACTED, method: "GET" });
  });

  it("keeps the error under an error key free of request internals", () => {
    const { testLogger, lastLine } = createTestLogger();
    testLogger.error({ error: axiosError }, "request failed");
    const { raw, parsed } = lastLine();

    expect(raw).not.toContain(BEARER_TOKEN);
    expect(raw).not.toContain("signature-secret-value");
    expect(valueAt(parsed, "error.code")).toBe("ERR_BAD_REQUEST");
    expect(valueAt(parsed, "error.status")).toBe(401);
  });

  it("leaves unrelated path fields alone", () => {
    const { testLogger, lastLine } = createTestLogger();
    testLogger.info({ path: "/api/v1/secrets", route: { path: "/api/v1/secrets" } }, "route hit");
    expect(lastLine().parsed).toMatchObject({ path: "/api/v1/secrets", route: { path: "/api/v1/secrets" } });
  });
});
