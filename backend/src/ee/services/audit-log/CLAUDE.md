# Audit Log Event Classes and Settings

Every `EventType` belongs to exactly one class in
`src/ee/services/audit-log/audit-log-event-classes.ts`: `management`, `authentication`,
`authorization` (only `PERMISSION_DENIED`), or `data-access`. The class is derived from the event
type at write and read time, so stored rows carry no class column. **A new event type is
`management` unless you add it to one of the explicit lists**, and `audit-log-event-classes.test.ts`
fails if a type lands in two lists. Reads, lists, dashboards, insights views, CMEK use operations
and the dynamic secret lease lifecycle are data access; VIEW_AUDIT_LOGS and privileged session
lifecycle are management on purpose.

Every class but management can be turned off per scope, and scopes do not inherit: an org (root or sub-org) has its own
rows for org-level events, each project has its own rows for its events, and a scope without a row uses
the default in `AUDIT_LOG_EVENT_CLASS_DEFAULTS` (data access on, authorization off). The rows live in
`audit_log_settings` (one per scope and class, `projectId` null for the org scope) behind
`audit-log-settings-service.ts`. `getEffectiveSettings(orgId, projectId?)` caches per scope, not per
org: one key for the org's rows plus `shouldUseNewPrivilegeSystem`, one key per org and project
(`{}` when it has no rows), read together in one `MGET` for 10 minutes. Never build a value that
holds every project in an org, since every event would fetch and parse it. Each write clears only its own scope's key, and
the lookup never throws: a failure records everything.
Enforcement is `isAuditLogEventEnabled` in the settings service, called from `buildStreamEntry` in
`audit-log-queue.ts` with the settings memoized per request so a batch of events costs one read.
Suppressed events are dropped silently and do not count on the dropped counter. Management is
always on: the helper returns true for it before looking at any row, `toSettings` reports it as
enabled, and the update methods reject any request that names it, so the change that turns a
class off is itself always recorded. An update is a full replacement: `PUT` must name every class in
`CONFIGURABLE_AUDIT_LOG_EVENT_CLASSES` exactly once, and the service deletes the scope's rows and
inserts the new set, so there is no merge with what was stored before.

`PERMISSION_DENIED` is recorded by the `onError` hook in
`src/server/plugins/audit-log-permission-denied.ts` for every CASL `ForbiddenError` and
`PermissionBoundaryError` (not `ForbiddenRequestError`, which verifyAuth and plan gates also throw),
only for orgs on the new privilege system whose plan has audit log retention, and collapsed per
actor, project, action, subject, route and method for one minute. `recordPermissionDenied` on the
audit log service never throws to the request. Because a legacy org can never record a denial, the
settings update methods reject a request that turns the authorization class on for one
(`assertAuthorizationClassAllowed`), and the UI locks the toggle with a link to the upgrade, so the
restriction is surfaced in the API error, the response's `shouldUseNewPrivilegeSystem`, the UI, and
the docs rather than stored as a setting that does nothing.

The collapse itself is generic. `createCollapsedAuditLog` on the audit log service takes any
`TCreateAuditLogDTO` plus `collapseKeyParts` (the event type is always part of the key) and an
optional `collapseWindowSeconds` (default 60). The first event per key is written at once and
schedules a delayed `AuditLogCollapsedFlush` job; repeats inside the window only bump a keystore
counter scoped to that window's start (which the window key holds as its value, so consecutive
windows and a late flush never share a counter), and the job writes one summary event with `suppressedRepeats`, `suppressedFrom` and
`suppressedUntil` in its metadata when the window closes, so a burst that stops is still accounted
for. To collapse another event, call it instead of `createAuditLog` and add
`TAuditLogCollapseSummary` to that event's metadata type so the summary fields are typed.
