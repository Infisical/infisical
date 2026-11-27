import { AnyAbility, ForbiddenError } from "@casl/ability";
import { requestContext } from "@fastify/request-context";
import fp from "fastify-plugin";

import { PermissionDeniedError } from "@app/domains/lib/errors";
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

// The permission an RBAC denial names (the domains' PermissionDeniedError, CASL ForbiddenError or
// PermissionBoundaryError), or undefined for any other error.
export const getPermissionDenialDetails = (error: unknown) => {
  if (error instanceof PermissionDeniedError && error.denial) {
    const { denial } = error;
    return {
      permissionAction: denial.action,
      permissionSubject: denial.subject,
      permissionSubjectDetails: pickSubjectDetails(denial.subjectFields),
      // Domain denials log the name CASL denials always had, so the audit log reads the same either way.
      errorName: "ForbiddenError"
    };
  }

  if (error instanceof ForbiddenError) {
    const caslError = error as ForbiddenError<AnyAbility>;
    return {
      permissionAction: caslError.action ? String(caslError.action) : undefined,
      permissionSubject: caslError.subjectType ? String(caslError.subjectType) : undefined,
      permissionSubjectDetails: pickSubjectDetails(caslError.subject),
      errorName: error.name
    };
  }

  if (error instanceof PermissionBoundaryError || (error instanceof PermissionDeniedError && error.isBoundaryRefusal)) {
    const missing = readMissingPermission((error as { details?: unknown }).details);
    return { permissionAction: missing?.action, permissionSubject: missing?.subject, errorName: error.name };
  }
};

// RBAC denials are the domains' PermissionDeniedError, CASL ForbiddenError or PermissionBoundaryError, and onError runs before the
// error handler, so this hook catches all of them. ForbiddenRequestError is skipped: it's mostly
// auth-mode, plan, admin-only and ownership checks with no action/subject, so it'd just be noise.
// Services that call permission.can() by hand and throw ForbiddenRequestError aren't captured,
// switch them to throwUnlessCan if you want them recorded.
export const injectPermissionDeniedAuditLog = fp(async (server: FastifyZodProvider) => {
  server.addHook("onError", async (req, _reply, error) => {
    const denial = getPermissionDenialDetails(error);
    if (!denial) return;
    if (!req.auth || !req.auditLogInfo?.actor) return;

    const orgId = req.auditLogInfo.orgId ?? req.actor?.orgId;
    if (!orgId) return;

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
        ...denial,
        route: req.routeOptions.url,
        method: req.method
      }
    });
  });
});
