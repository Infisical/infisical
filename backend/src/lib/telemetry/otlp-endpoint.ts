const OTLP_METRICS_PATH = "/v1/metrics";

export const resolveOtlpMetricsEndpoint = (endpoint?: string) => {
  if (!endpoint) {
    throw new Error("OTEL_EXPORT_OTLP_ENDPOINT must be set when OTEL_EXPORT_TYPE is 'otlp'");
  }

  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    throw new Error("OTEL_EXPORT_OTLP_ENDPOINT must be a valid absolute URL");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("OTEL_EXPORT_OTLP_ENDPOINT must use HTTP or HTTPS");
  }

  const pathname = url.pathname.replace(/\/+$/, "");
  url.pathname = pathname.endsWith(OTLP_METRICS_PATH) ? pathname : `${pathname}${OTLP_METRICS_PATH}`;

  return url.toString();
};
