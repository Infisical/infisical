import { AnyAbility, ForbiddenError } from "@casl/ability";
import { requestContext } from "@fastify/request-context";
import fp from "fastify-plugin";

import { PermissionBoundaryError } from "@app/lib/errors";
import { RequestContextKey } from "@app/lib/request-context/request-context-keys";

const isPrimitive = (value: unknown) => value === null || ["string", "number", "boolean"].includes(typeof value);

// The subject() marker is non-enumerable so it drops out. Nested objects are skipped on
// purpose since the subject can wrap a request body.
const pickSubjectDetails = (subject: unknown) => {
  if (!subject || typeof subject !== "object" || Array.isArray(subject)) return undefined;
  const details: Record<string, unknown> = {};
  Object.entries(subject as Record<string, unknown>).forEach(([key, value]) => {
    if (isPrimitive(value) || (Array.isArray(value) && value.every(isPrimitive))) {
      details[key] = value;
    }
  });
  return Object.keys(details).length ? details : undefined;
};

const readMissingPermission = (details: unknown) => {
  if (!details || typeof details !== "object") return undefined;
  const { missingPermissions } = details as { missingPermissions?: { action?: unknown; subject?: unknown }[] };
  const first = Array.isArray(missingPermissions) ? missingPermissions[0] : undefined;
  if (!first) return undefined;
  return {
    action: typeof first.action === "string" ? first.action : undefined,
    subject: typeof first.subject === "string" ? first.subject : undefined
  };
};

const readProjectId = (source: unknown) => {
  if (!source || typeof source !== "object") return undefined;
  const { projectId } = source as { projectId?: unknown };
  return typeof projectId === "string" ? projectId : undefined;
};

// RBAC denials surface as a CASL ForbiddenError or PermissionBoundaryError, and onError hooks run
// before the error handler, so this one hook sees them all. ForbiddenRequestError is skipped on
// purpose: most of its throw sites are auth-mode mismatches, plan gating, admin-only checks and
// ownership checks that carry no action or subject, so recording them would bury real denials.
// The few services that evaluate permission.can() by hand and throw ForbiddenRequestError are
// not captured here; move them onto throwUnlessCan to record them.
export const injectPermissionDeniedAuditLog = fp(async (server: FastifyZodProvider) => {
  server.addHook("onError", async (req, _reply, error) => {
    const isCaslDenial = error instanceof ForbiddenError;
    if (!isCaslDenial && !(error instanceof PermissionBoundaryError)) return;
    if (!req.auth || !req.auditLogInfo?.actor) return;

    const orgId = req.auditLogInfo.orgId ?? req.permission?.orgId;
    if (!orgId) return;

    const caslError = isCaslDenial ? (error as unknown as ForbiddenError<AnyAbility>) : undefined;
    const missing = isCaslDenial ? undefined : readMissingPermission((error as PermissionBoundaryError).details);

    const { schema } = req.routeOptions;
    const projectId =
      requestContext.get(RequestContextKey.ProjectDetails)?.id ??
      readProjectId(req.params) ??
      (schema?.body ? readProjectId(req.body) : undefined) ??
      (schema?.querystring ? readProjectId(req.query) : undefined);

    void server.services.auditLog.recordPermissionDenied({
      ...req.auditLogInfo,
      orgId,
      projectId,
      metadata: {
        permissionAction: caslError?.action ? String(caslError.action) : missing?.action,
        permissionSubject: caslError?.subjectType ? String(caslError.subjectType) : missing?.subject,
        permissionSubjectDetails: pickSubjectDetails(caslError?.subject),
        errorName: error.name,
        route: req.routeOptions.url,
        method: req.method
      }
    });
  });
});
