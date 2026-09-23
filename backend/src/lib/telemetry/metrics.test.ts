import opentelemetry from "@opentelemetry/api";

import { highCardinalityMeter, normalizeHttpMethod, shouldRecordHighCardinalityMetrics } from "./metrics";

const mockConfig = {
  OTEL_TELEMETRY_COLLECTION_ENABLED: true,
  OTEL_DROP_HIGH_CARDINALITY_METERS: false
};

vi.mock("@app/lib/config/env", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@app/lib/config/env")>()),
  getConfig: () => mockConfig
}));

// resolveMeter() memoizes per meter name, so each test uses a fresh name to observe the first resolution.
let meterNameSeq = 0;
const uniqueMeterName = () => {
  meterNameSeq += 1;
  return `TestMeter${meterNameSeq}`;
};

describe("shouldRecordHighCardinalityMetrics", () => {
  beforeEach(() => {
    mockConfig.OTEL_TELEMETRY_COLLECTION_ENABLED = true;
    mockConfig.OTEL_DROP_HIGH_CARDINALITY_METERS = false;
  });

  test("records only when telemetry is enabled and the meters are not dropped", () => {
    expect(shouldRecordHighCardinalityMetrics()).toBe(true);

    mockConfig.OTEL_DROP_HIGH_CARDINALITY_METERS = true;
    expect(shouldRecordHighCardinalityMetrics()).toBe(false);

    mockConfig.OTEL_TELEMETRY_COLLECTION_ENABLED = false;
    expect(shouldRecordHighCardinalityMetrics()).toBe(false);

    mockConfig.OTEL_DROP_HIGH_CARDINALITY_METERS = false;
    expect(shouldRecordHighCardinalityMetrics()).toBe(false);
  });
});

describe("highCardinalityMeter", () => {
  beforeEach(() => {
    mockConfig.OTEL_TELEMETRY_COLLECTION_ENABLED = true;
    mockConfig.OTEL_DROP_HIGH_CARDINALITY_METERS = false;
    vi.restoreAllMocks();
  });

  // The DROP view suppresses the aggregated value but not the attribute key, which the SDK retains for
  // the lifetime of the process under cumulative temporality. Bounding that memory requires the SDK to
  // never see the measurement at all, so assert nothing reaches it rather than that nothing is exported.
  test("does not touch the SDK at all when the meters are dropped", () => {
    mockConfig.OTEL_DROP_HIGH_CARDINALITY_METERS = true;
    const getMeter = vi.spyOn(opentelemetry.metrics, "getMeter");
    const meter = highCardinalityMeter(uniqueMeterName());

    meter.createCounter("test.counter").add(1, { "client.address": "10.0.0.1" });
    meter.createHistogram("test.histogram").record(1, { "client.address": "10.0.0.1" });

    expect(getMeter).not.toHaveBeenCalled();
  });

  test("resolves the meter and records when the meters are enabled", () => {
    const getMeter = vi.spyOn(opentelemetry.metrics, "getMeter");
    const meterName = uniqueMeterName();
    const meter = highCardinalityMeter(meterName);

    meter.createCounter("test.counter").add(1);
    meter.createHistogram("test.histogram").record(1);

    expect(getMeter).toHaveBeenCalledWith(meterName);
  });

  // Every record helper in the module funnels through this wrapper, so a broken exporter or a bad
  // instrument name can never surface as an exception in the code being measured.
  test("does not throw into the call site when the SDK does", () => {
    const broken = () => {
      throw new Error("exporter broken");
    };
    vi.spyOn(opentelemetry.metrics, "getMeter").mockReturnValue({
      createCounter: broken,
      createHistogram: broken
    } as never);
    const meter = highCardinalityMeter(uniqueMeterName());

    expect(() => meter.createCounter("test.counter").add(1)).not.toThrow();
    expect(() => meter.createHistogram("test.histogram").record(1)).not.toThrow();
  });

  test("stays a no-op while telemetry is disabled, then records once it is enabled", () => {
    mockConfig.OTEL_TELEMETRY_COLLECTION_ENABLED = false;
    const getMeter = vi.spyOn(opentelemetry.metrics, "getMeter");
    const meterName = uniqueMeterName();
    const counter = highCardinalityMeter(meterName).createCounter("test.counter");

    counter.add(1);
    expect(getMeter).not.toHaveBeenCalled();

    mockConfig.OTEL_TELEMETRY_COLLECTION_ENABLED = true;
    counter.add(1);
    expect(getMeter).toHaveBeenCalledWith(meterName);
  });
});

// KNOWN_HTTP_METHODS is a hand copy of the private KNOWN_METHODS set inside
// @opentelemetry/instrumentation-http. If the library's set changes on an upgrade, the two metrics stop
// agreeing on http.request.method and silently become unjoinable, so pin the whole contract here.
describe("normalizeHttpMethod", () => {
  test.each(["GET", "HEAD", "POST", "PUT", "DELETE", "CONNECT", "OPTIONS", "TRACE", "PATCH", "QUERY"])(
    "keeps the semconv-known method %s",
    (method) => {
      expect(normalizeHttpMethod(method)).toBe(method);
    }
  );

  test("upper-cases a known method given in another case", () => {
    expect(normalizeHttpMethod("get")).toBe("GET");
    expect(normalizeHttpMethod("Patch")).toBe("PATCH");
  });

  // Node's parser accepts 35 methods, so these reach us for real; the semconv vocabulary has 10.
  test.each(["PROPFIND", "MKCOL", "UNLOCK", "M-SEARCH", "PURGE"])("folds %s onto _OTHER", (method) => {
    expect(normalizeHttpMethod(method)).toBe("_OTHER");
  });

  test("defaults to GET when the method is absent, matching the instrumentation", () => {
    expect(normalizeHttpMethod(undefined)).toBe("GET");
    expect(normalizeHttpMethod("")).toBe("GET");
  });
});
