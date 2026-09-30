import fp from "fastify-plugin";

const API_CONTENT_SECURITY_POLICY = [
  "default-src 'none'",
  "frame-ancestors 'none'",
  "base-uri 'none'",
  "form-action 'none'"
].join("; ");

// Documents keep their allowlist in the page (the SPA's meta tag); sent as a header, the SPA's would
// overflow a default 4k proxy buffer. frame-ancestors 'self' matches helmet's X-Frame-Options.
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

// Chosen by content type, which helmet's single CSP cannot do. A route that sets its own CSP keeps it.
export const responsePolicyHeaders = fp(async (fastify) => {
  fastify.addHook("onSend", async (_req, res, payload) => {
    if (!res.hasHeader("Content-Security-Policy")) {
      const isDocument = String(res.getHeader("content-type") ?? "").includes("text/html");
      void res.header(
        "Content-Security-Policy",
        isDocument ? DOCUMENT_CONTENT_SECURITY_POLICY : API_CONTENT_SECURITY_POLICY
      );
    }
    void res.header("Permissions-Policy", PERMISSIONS_POLICY);
    return payload;
  });
});
