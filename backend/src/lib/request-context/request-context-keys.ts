/**
 * Runtime string keys for `@fastify/request-context`.
 * Keep in sync with `RequestContextData` in `src/@types/fastify.d.ts`.
 */
export const requestContextKeys = {
  assumedPrivilegeDetails: "assumedPrivilegeDetails",
  identityAuthInfo: "identityAuthInfo",
  identityPermissionMetadata: "identityPermissionMetadata",
  ip: "ip",
  memoizer: "memoizer",
  orgId: "orgId",
  orgName: "orgName",
  projectDetails: "projectDetails",
  reqId: "reqId",
  userAgent: "userAgent",
  userAuthInfo: "userAuthInfo"
} as const;
