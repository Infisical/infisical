import { AnyAbility, ForbiddenError } from "@casl/ability";
import { requestContext } from "@fastify/request-context";
import fp from "fastify-plugin";

import { PermissionBoundaryError } from "@app/lib/errors";
import { RequestContextKey } from "@app/lib/request-context/request-context-keys";

const isPrimitive = (value: unknown) => value === null || ["string", "number", "boolean"].includes(typeof value);

// subject() marker is non-enumerable so it's dropped. Nested objects are skipped since the
// subject can wrap a request body.
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

// RBAC denials are CASL ForbiddenError or PermissionBoundaryError, and onError runs before the
// error handler, so this hook catches all of them. ForbiddenRequestError is skipped: it's mostly
// auth-mode, plan, admin-only and ownership checks with no action/subject, so it'd just be noise.
// Services that call permission.can() by hand and throw ForbiddenRequestError aren't captured,
// switch them to throwUnlessCan if you want them recorded.
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
