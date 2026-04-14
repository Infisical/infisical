/**
 * Runtime string keys for `@fastify/request-context`.
 * Keep in sync with `RequestContextData` in `src/@types/fastify.d.ts`.
 */
export enum RequestContextKey {
  AssumedPrivilegeDetails = "assumedPrivilegeDetails",
  IdentityAuthInfo = "identityAuthInfo",
  IdentityPermissionMetadata = "identityPermissionMetadata",
  Ip = "ip",
  Memoizer = "memoizer",
  OrgId = "orgId",
  OrgName = "orgName",
  ProjectDetails = "projectDetails",
  ReqId = "reqId",
  UserAgent = "userAgent",
  UserAuthInfo = "userAuthInfo"
}
