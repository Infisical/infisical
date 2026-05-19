import { describe, expect, test } from "vitest";

import { parseMilvusHost, resolveMilvusUseTls } from "./milvus";

describe("parseMilvusHost", () => {
  test("parses bare localhost", () => {
    const { hostname, origin } = parseMilvusHost("localhost", 19530, false);
    expect(hostname).toBe("localhost");
    expect(origin).toBe("http://localhost:19530");
  });

  test("parses localhost with http scheme", () => {
    const { hostname, origin } = parseMilvusHost("http://localhost", 19530, false);
    expect(hostname).toBe("localhost");
    expect(origin).toBe("http://localhost:19530");
  });

  test("uses https when TLS is enabled", () => {
    const { hostname, origin } = parseMilvusHost("milvus.example.com", 19530, true);
    expect(hostname).toBe("milvus.example.com");
    expect(origin).toBe("https://milvus.example.com:19530");
  });

  test("overrides embedded port with the port input", () => {
    const { hostname, origin } = parseMilvusHost("localhost:9999", 19530, false);
    expect(hostname).toBe("localhost");
    expect(origin).toBe("http://localhost:19530");
  });

  test("parses bare IPv4 address", () => {
    const { hostname, origin } = parseMilvusHost("127.0.0.1", 19530, false);
    expect(hostname).toBe("127.0.0.1");
    expect(origin).toBe("http://127.0.0.1:19530");
  });

  test("uses https when host scheme is https without CA", () => {
    const { hostname, origin } = parseMilvusHost("https://localhost", 19530, resolveMilvusUseTls("https://localhost"));
    expect(hostname).toBe("localhost");
    expect(origin).toBe("https://localhost:19530");
  });
});

describe("resolveMilvusUseTls", () => {
  test("enables TLS for https host without CA", () => {
    expect(resolveMilvusUseTls("https://milvus.example.com")).toBe(true);
  });

  test("disables TLS for http host even when CA is provided", () => {
    expect(resolveMilvusUseTls("http://milvus.example.com", "ca-cert")).toBe(false);
  });

  test("enables TLS for bare host when CA is provided", () => {
    expect(resolveMilvusUseTls("milvus.example.com", "ca-cert")).toBe(true);
  });

  test("disables TLS for bare host without CA", () => {
    expect(resolveMilvusUseTls("localhost")).toBe(false);
  });
});
