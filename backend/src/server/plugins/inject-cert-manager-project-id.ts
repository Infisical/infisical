import { FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";
import RE2 from "re2";

import { BadRequestError } from "@app/lib/errors";

const CERT_MANAGER_PREFIXES = ["/api/v1/cert-manager/", "/api/v1/pki/", "/api/v2/pki/"];

const COOKIE_PREFIX = "infisical-cm-active-project-";

const certManagerActiveProjectCookieName = (orgId: string) => `${COOKIE_PREFIX}${orgId}`;

const UUID_REGEX = new RE2("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", "i");
const isUuid = (value: string) => UUID_REGEX.test(value);

const readProjectIdFromRequest = (req: { query?: unknown; body?: unknown; params?: unknown }): string | null => {
  const fromQuery = (req.query as { projectId?: unknown } | undefined)?.projectId;
  if (typeof fromQuery === "string" && fromQuery.length > 0) return fromQuery;
  const fromBody = (req.body as { projectId?: unknown } | undefined)?.projectId;
  if (typeof fromBody === "string" && fromBody.length > 0) return fromBody;
  const params = req.params as { projectId?: unknown; workspaceId?: unknown } | undefined;
  const fromParams = params?.projectId ?? params?.workspaceId;
  if (typeof fromParams === "string" && fromParams.length > 0) return fromParams;
  return null;
};

const readProjectIdFromCookie = (
  cookies: Record<string, string | undefined> | undefined,
  orgId: string
): string | null => {
  const value = cookies?.[certManagerActiveProjectCookieName(orgId)];
  if (!value || !isUuid(value)) return null;
  return value;
};

export const injectCertManagerProjectId: FastifyPluginAsync = fp(async (server) => {
  server.decorateRequest("internalCertManagerProjectId", "");

  server.addHook("preValidation", async (req) => {
    if (!req.permission?.orgId) return;

    const routePath = req.routeOptions.url ?? "";
    if (!CERT_MANAGER_PREFIXES.some((prefix) => routePath.startsWith(prefix))) return;

    if (routePath === "/api/v1/cert-manager/instance" || routePath.startsWith("/api/v1/cert-manager/instance/")) {
      return;
    }

    if (routePath === "/api/v1/cert-manager/export") {
      return;
    }

    const explicit = readProjectIdFromRequest(req);
    if (explicit) {
      if (!isUuid(explicit)) {
        throw new BadRequestError({ message: "Invalid Certificate Manager project." });
      }
      const isValidForOrg = await server.services.certManagerProjectResolver.isCertManagerProject(
        explicit,
        req.permission.orgId
      );
      if (!isValidForOrg) {
        throw new BadRequestError({
          message: "Invalid Certificate Manager project."
        });
      }
      req.internalCertManagerProjectId = explicit;
      return;
    }

    const fromCookie = readProjectIdFromCookie(req.cookies, req.permission.orgId);
    if (fromCookie) {
      const isValidForOrg = await server.services.certManagerProjectResolver.isCertManagerProject(
        fromCookie,
        req.permission.orgId
      );
      if (isValidForOrg) {
        req.internalCertManagerProjectId = fromCookie;
        return;
      }
    }

    req.internalCertManagerProjectId = await server.services.certManagerProjectResolver.resolve(req.permission.orgId);
  });
});
