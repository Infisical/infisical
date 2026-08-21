import { resolveOtlpMetricsEndpoint } from "./otlp-endpoint";

describe("resolveOtlpMetricsEndpoint", () => {
  test.each([
    ["http://otel-collector:4318", "http://otel-collector:4318/v1/metrics"],
    ["http://otel-collector:4318/", "http://otel-collector:4318/v1/metrics"],
    ["http://otel-collector:4318/v1/metrics", "http://otel-collector:4318/v1/metrics"],
    ["http://otel-collector:4318/v1/metrics/", "http://otel-collector:4318/v1/metrics"],
    ["https://example.com/otel", "https://example.com/otel/v1/metrics"],
    ["https://example.com/otel?tenant=infisical", "https://example.com/otel/v1/metrics?tenant=infisical"]
  ])("normalizes %s", (endpoint, expected) => {
    expect(resolveOtlpMetricsEndpoint(endpoint)).toBe(expected);
  });

  test.each([undefined, "", "otel-collector:4318"])("rejects invalid endpoint %s", (endpoint) => {
    expect(() => resolveOtlpMetricsEndpoint(endpoint)).toThrow(/OTEL_EXPORT_OTLP_ENDPOINT/);
  });
});
