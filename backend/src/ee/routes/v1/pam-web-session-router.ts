import { z } from "zod";

import { logger } from "@app/lib/logger";
import { writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

export const registerPamWebSessionRouter = async (server: FastifyZodProvider) => {
  // Allow image/jpeg content type for screenshot capture
  server.addContentTypeParser("image/jpeg", { parseAs: "buffer" }, (_req, body, done) => {
    done(null, body);
  });

  // Create a web proxy session
  server.route({
    method: "POST",
    url: "/",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      description: "Create a web proxy session",
      body: z.object({
        accountId: z.string().uuid(),
        projectId: z.string().uuid()
      }),
      response: {
        200: z.object({
          sessionId: z.string().uuid()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const { accountId, projectId } = req.body;
      const result = await server.services.pamWebSession.createWebSession({
        accountId,
        projectId,
        orgId: req.permission.orgId,
        actor: req.permission,
        actorEmail: req.auth.user?.email ?? "",
        actorName: req.auth.user?.firstName
          ? `${req.auth.user.firstName} ${req.auth.user.lastName ?? ""}`.trim()
          : req.auth.user?.email ?? "",
        actorIp: req.realIp,
        actorUserAgent: req.headers["user-agent"] ?? "",
        auditLogInfo: req.auditLogInfo
      });

      return result;
    }
  });

  // Proxy endpoint — uses wildcard to capture the full path.
  // No Zod schema validation on params (wildcard doesn't play well with it).
  // Auth is via session ID validity — session creation requires JWT.
  // Single proxy handler — handles both /proxy and /proxy/*
  const proxyHandler = async (req: any, reply: any) => {
      const sessionId = (req.params as Record<string, string>).sessionId;
      const wildcardPath = (req.params as Record<string, string>)["*"] || "";

      const tunnel = server.services.pamWebSession.getTunnel(sessionId);
      if (!tunnel) {
        void reply.status(404);
        return reply.send({ message: "Session not found or expired" });
      }

      // Build full path with query string
      const url = req.url;
      const proxyPrefix = `/api/v1/pam/web-sessions/${sessionId}/proxy/`;
      const prefixIdx = url.indexOf(proxyPrefix);
      let fullPath: string;
      if (prefixIdx >= 0) {
        fullPath = `/${url.slice(prefixIdx + proxyPrefix.length)}`;
      } else {
        const queryIdx = url.indexOf("?");
        const queryString = queryIdx >= 0 ? url.slice(queryIdx) : "";
        fullPath = `/${wildcardPath}${queryString}`;
      }

      logger.info({ sessionId, fullPath, method: req.method }, "Proxy request received");

      // Intercept screenshot capture requests — don't forward to gateway
      if (fullPath.includes("__infisical_capture")) {
        logger.info({ sessionId, fullPath, method: req.method }, "Screenshot capture request received");
      }
      if (fullPath === "/__infisical_capture" && req.method === "POST") {
        const imageBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);

        if (imageBody.length > 0) {
          server.services.pamWebSession.storeScreenshot(sessionId, imageBody as Buffer);
        }

        void reply.status(200);
        return reply.send({ ok: true });
      }

      // Collect request body
      const body = await new Promise<Buffer>((resolve) => {
        const chunks: Buffer[] = [];
        req.raw.on("data", (chunk: Buffer) => chunks.push(chunk));
        req.raw.on("end", () => resolve(Buffer.concat(chunks)));
        if (req.raw.readableEnded) resolve(Buffer.alloc(0));
      });

      let result;
      try {
        result = await server.services.pamWebSession.proxyRequest(
          sessionId,
          fullPath,
          req.method,
          req.headers as Record<string, string | string[] | undefined>,
          body
        );
      } catch (err) {
        logger.error(err, "Proxy request failed");
        void reply.status(502);
        return reply.send({ message: `Proxy error: ${err instanceof Error ? err.message : String(err)}` });
      }

      const proxyBase = `/api/v1/pam/web-sessions/${sessionId}/proxy/`;
      const targetOrigin = new URL(tunnel.targetUrl).origin;

      // Copy and clean response headers
      const responseHeaders = { ...result.headers };
      delete responseHeaders["content-security-policy"];
      delete responseHeaders["content-security-policy-report-only"];
      delete responseHeaders["x-frame-options"];
      delete responseHeaders["strict-transport-security"];
      delete responseHeaders["transfer-encoding"];
      delete responseHeaders["content-length"];

      // Rewrite Location header for redirects
      if (responseHeaders.location) {
        const location = responseHeaders.location as string;
        if (location.startsWith("/")) {
          responseHeaders.location = `${proxyBase}${location.slice(1)}`;
        } else if (location.startsWith(targetOrigin)) {
          const internalPath = location.slice(targetOrigin.length);
          responseHeaders.location = `${proxyBase}${internalPath.startsWith("/") ? internalPath.slice(1) : internalPath}`;
        }
      }

      // Rewrite Set-Cookie
      if (responseHeaders["set-cookie"]) {
        const cookies = Array.isArray(responseHeaders["set-cookie"])
          ? responseHeaders["set-cookie"]
          : [responseHeaders["set-cookie"]];

        responseHeaders["set-cookie"] = cookies.map((cookie) => {
          return cookie
            .replace(/;\s*domain=[^;]*/gi, "")
            .replace(/;\s*path=[^;]*/gi, `; Path=${proxyBase}`);
        });
      }

      let responseBody = result.body;
      const contentType = (responseHeaders["content-type"] as string) || "";

      // Rewrite HTML
      if (contentType.includes("text/html")) {
        let html = responseBody.toString("utf-8");

        // Inject <base> tag for truly relative URLs (e.g. "style.css", "../img.png")
        const baseTag = `<base href="${proxyBase}">`;
        if (html.includes("<head>")) {
          html = html.replace("<head>", `<head>${baseTag}`);
        } else if (/<head\s/i.test(html)) {
          html = html.replace(/<head\s[^>]*>/i, `$&${baseTag}`);
        } else if (html.includes("<html")) {
          html = html.replace(/<html[^>]*>/i, `$&<head>${baseTag}</head>`);
        } else {
          html = `${baseTag}${html}`;
        }

        // Rewrite root-relative URLs in href, src, action attributes.
        // <base> does NOT handle root-relative URLs (starting with /).
        // e.g. href="/settings" → href="/api/v1/pam/web-sessions/xxx/proxy/settings"
        html = html.replace(
          /(href|src|action)=(["'])\/((?!\/|api\/v1\/pam\/)[^"']*)/gi,
          `$1=$2${proxyBase}$3`
        );

        // Replace absolute URLs pointing to the internal origin
        html = html.split(targetOrigin + "/").join(proxyBase);
        html = html.split(targetOrigin).join(proxyBase.slice(0, -1));

        responseBody = Buffer.from(html, "utf-8");
      }

      // Rewrite CSS: replace absolute and root-relative URLs
      if (contentType.includes("text/css")) {
        let css = responseBody.toString("utf-8");
        // Rewrite url(/path) → url(/api/v1/pam/.../proxy/path)
        css = css.replace(
          /url\(["']?\/((?!\/|api\/v1\/pam\/)[^"')]*)/gi,
          `url(${proxyBase}$1`
        );
        css = css.split(targetOrigin + "/").join(proxyBase);
        css = css.split(targetOrigin).join(proxyBase.slice(0, -1));
        responseBody = Buffer.from(css, "utf-8");
      }

      // Send response
      Object.entries(responseHeaders).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          void reply.header(key, value);
        }
      });

      void reply.header("content-length", responseBody.length);
      void reply.status(result.statusCode);

      return reply.send(responseBody);
  };

  const proxyMethods = ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS", "HEAD"] as const;

  server.route({
    method: [...proxyMethods],
    url: "/:sessionId/proxy",
    schema: { hide: true },
    handler: proxyHandler
  });

  server.route({
    method: [...proxyMethods],
    url: "/:sessionId/proxy/*",
    schema: { hide: true },
    handler: proxyHandler
  });

  // End/cleanup a web session
  server.route({
    method: "POST",
    url: "/:sessionId/end",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      params: z.object({
        sessionId: z.string().uuid()
      }),
      response: {
        200: z.object({
          success: z.boolean()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const { sessionId } = req.params;
      await server.services.pamWebSession.cleanupSession(sessionId);
      return { success: true };
    }
  });
};
