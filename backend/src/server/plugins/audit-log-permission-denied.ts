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

// Every RBAC denial is a CASL ForbiddenError or PermissionBoundaryError, and onError hooks run
// before the error handler, so this one hook sees all of them. ForbiddenRequestError is skipped
// on purpose: it's used for auth-mode mismatches, plan gating and admin-only checks, none of
// which are permission decisions.
export const injectPermissionDeniedAuditLog = fp(async (server: FastifyZodProvider) => {
  server.addHook("onError", async (req, _reply, error) => {
    const isCaslDenial = error instanceof ForbiddenError;
    if (!isCaslDenial && !(error instanceof PermissionBoundaryError)) return;
    if (!req.auth || !req.auditLogInfo?.actor) return;

    const orgId = req.auditLogInfo.orgId ?? req.permission?.orgId;
    if (!orgId) return;

    const caslError = isCaslDenial ? (error as unknown as ForbiddenError<AnyAbility>) : undefined;
    const missing = isCaslDenial ? undefined : readMissingPermission((error as PermissionBoundaryError).details);
    const projectId =
      requestContext.get(RequestContextKey.ProjectDetails)?.id ??
      readProjectId(req.params) ??
      readProjectId(req.body) ??
      readProjectId(req.query);

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
