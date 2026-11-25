import fp from "fastify-plugin";

const API_DIRECTIVES = ["default-src 'none'", "frame-ancestors 'none'", "base-uri 'none'", "form-action 'none'"];
const API_CONTENT_SECURITY_POLICY = API_DIRECTIVES.join("; ");

// Opened directly, an SVG is a document: its <style> blocks and style attributes need inline styles to render.
// sandbox keeps it from running scripts, submitting forms or navigating.
const SVG_CONTENT_SECURITY_POLICY = [...API_DIRECTIVES, "style-src 'unsafe-inline'", "sandbox"].join("; ");

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

const contentSecurityPolicyFor = (contentType: string) => {
  if (contentType.includes("text/html")) return DOCUMENT_CONTENT_SECURITY_POLICY;
  if (contentType.includes("image/svg+xml")) return SVG_CONTENT_SECURITY_POLICY;
  return API_CONTENT_SECURITY_POLICY;
};

export const responsePolicyHeaders = fp(async (fastify) => {
  fastify.addHook("onSend", async (_req, res, payload) => {
    if (res.statusCode === 304) return payload;
    if (!res.hasHeader("Content-Security-Policy")) {
      const contentType = String(res.getHeader("content-type") ?? "").toLowerCase();
      void res.header("Content-Security-Policy", contentSecurityPolicyFor(contentType));
    }
    if (!res.hasHeader("Permissions-Policy")) {
      void res.header("Permissions-Policy", PERMISSIONS_POLICY);
    }
    return payload;
  });
});
