import { Readable } from "node:stream";
import { gzipSync } from "node:zlib";

import { ClickHouseClient } from "@clickhouse/client";
import { describe, expect, it, vi } from "vitest";

import { executeClickHouseStatement } from "./clickhouse-connection-fns";

vi.mock("@app/lib/validator", () => ({ buildUncachedSsrfSafeAgent: vi.fn() }));

const respondWith = (body: Buffer, statusCode: number, headers: Record<string, string> = {}) =>
  ({
    exec: async () => ({ stream: Readable.from([body]), http_status_code: statusCode, response_headers: headers })
  }) as unknown as ClickHouseClient;

describe("executeClickHouseStatement", () => {
  it("resolves on a successful response", async () => {
    await expect(executeClickHouseStatement(respondWith(Buffer.from("1\n"), 200), "SELECT 1")).resolves.toBeUndefined();
  });

  it("throws the error ClickHouse returns", async () => {
    const error = Buffer.from("Code: 516. DB::Exception: manager: Authentication failed. (AUTHENTICATION_FAILED)");

    await expect(executeClickHouseStatement(respondWith(error, 516), "SELECT 1")).rejects.toThrow(
      "Authentication failed"
    );
  });

  it("stops reading a response larger than 1 MB", async () => {
    const response = respondWith(Buffer.alloc(2 * 1024 * 1024), 500);

    await expect(executeClickHouseStatement(response, "SELECT 1")).rejects.toThrow("larger than 1 MB");
  });

  it("refuses a small gzip error response that decompresses past 1 MB", async () => {
    const bomb = gzipSync(Buffer.alloc(64 * 1024 * 1024));
    const response = respondWith(bomb, 500, { "content-encoding": "gzip" });

    expect(bomb.length).toBeLessThan(1024 * 1024);
    await expect(executeClickHouseStatement(response, "SELECT 1")).rejects.toThrow("couldn't read");
  });
});
