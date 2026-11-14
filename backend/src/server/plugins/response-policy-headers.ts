import fp from "fastify-plugin";

const API_CONTENT_SECURITY_POLICY = [
  "default-src 'none'",
  "frame-ancestors 'none'",
  "base-uri 'none'",
  "form-action 'none'"
].join("; ");

// The SPA keeps its allowlist in a meta tag; it is too large to send as a header.
// frame-ancestors overrides X-Frame-Options, so keep it in line with helmet's frameguard.
const DOCUMENT_CONTENT_SECURITY_POLICY = ["frame-ancestors 'self'", "base-uri 'self'", "object-src 'none'"].join("; ");

// Device and sensor features the product does not use.
const PERMISSIONS_POLICY = [
  "accelerometer=()",
  "bluetooth=()",
  "camera=()",
  "display-capture=()",
  "geolocation=()",
  "gyroscope=()",
  "magnetometer=()",
  "microphone=()",
  "midi=()",
  "serial=()",
  "usb=()",
  "xr-spatial-tracking=()"
].join(", ");

export const responsePolicyHeaders = fp(async (fastify) => {
  fastify.addHook("onSend", async (_req, res, payload) => {
    if (!res.hasHeader("Content-Security-Policy")) {
      const isHtml = String(res.getHeader("content-type") ?? "")
        .toLowerCase()
        .includes("text/html");
      void res.header(
        "Content-Security-Policy",
        isHtml ? DOCUMENT_CONTENT_SECURITY_POLICY : API_CONTENT_SECURITY_POLICY
      );
    }
    void res.header("Permissions-Policy", PERMISSIONS_POLICY);
    return payload;
  });
});
