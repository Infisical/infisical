---
name: product-analytics
description: Use when shipping or changing any user-facing feature, API endpoint, or API client. Defines the telemetry attribution contract product events must satisfy before the PR is done.
---

# Product Analytics

Every product change must leave PostHog able to answer: which organization did this, through which client, and how often. Historically, features shipped without this and the gaps (events with no org, whole client ecosystems collapsing into channel `other`) were discovered months later when someone tried to run the numbers. Check your change against this contract before calling the work done.

## When this skill applies

- Adding a new product feature or user-facing flow (backend or frontend)
- Adding or changing an API endpoint that represents a product action
- Adding a new API client, SDK, integration, or agent that calls the Infisical API
- Changing existing telemetry events, their properties, or the telemetry pipeline

## The attribution contract

All product events go through the backend telemetry service: `server.services.telemetry.sendPostHogEvents(...)` (implemented in `backend/src/services/telemetry/telemetry-service.ts`). Never construct an ad-hoc PostHog client or call `posthog.capture` directly from feature code.

Every event must carry:

| Field | How |
|---|---|
| `organizationId` | Top-level field on the event, from `req.permission.orgId`. Required. An event without it is invisible to per-customer analysis. |
| `projectId` | Property, where the action is project-scoped |
| `environment` | Property, where the action is environment-scoped |
| `actorType` | Property, from `req.permission.type` |
| `distinctId` | Use `getTelemetryDistinctId(req)` from `backend/src/server/lib/telemetry.ts`. Do not invent your own scheme. |

The `distinctId` conventions (from `getTelemetryDistinctId` and `telemetry-service.ts` `identifyIdentity`):

- **Users**: `req.auth.user.username` (normally the email)
- **Machine identities**: `identity-${identityId}`
- Service tokens fall back to the creator's email (deprecated auth mode, do not use in new code)

Register the event name in the `PostHogEventTypes` enum and add a typed properties interface in `backend/src/services/telemetry/telemetry-types.ts`. Spread `...req.auditLogInfo` into properties so `userAgent`/`userAgentType` come along. See `backend/src/server/routes/v4/secret-router.ts` (the `SecretPulled` capture around line 250) for the canonical emission shape.

## High-volume events must aggregate

Anything fired per secret operation, per login, or otherwise once per machine request will produce hundreds of millions of raw events. These must use the aggregation pipeline, not direct capture:

1. Add the event to `POSTHOG_AGGREGATED_EVENTS` in `backend/src/services/telemetry/telemetry-service.ts`. Events in that list are buffered in Redis and flushed by a cron as `<event> aggregated`.
2. Add `channel` (and `actorType` if you need it) to `AGGREGATION_BREAKDOWN_DIMENSIONS` for your event in the same file. Properties not listed there get histogram-ized into objects like `{"cli": 3, "other": 812}` during aggregation, which PostHog cannot break down on. Breakdown dimensions become part of the grouping key and stay flat strings.

Org attribution survives aggregation only if `organizationId` was set at ingest, so the contract above still applies.

## New API clients: branded User-Agent, mapped in BOTH backends

The `channel` property on events is derived purely from the `User-Agent` header by `getUserAgentType`. Any client whose UA is not recognized lands in channel `other`, where 80% of secret-pull traffic already lives because past SDKs shipped with default or missing UAs.

Every new client, SDK, or integration MUST:

1. Send a branded, versioned User-Agent on every request: `infisical-<client>/<version>` (e.g. `infisical-go-sdk/0.5.0`). Never ship with the HTTP library's default UA, and never ship with no UA.
2. Register it in the user-agent matcher in **both** backends:
   - Node: `getUserAgentType` in `backend/src/server/plugins/audit-log.ts`, plus a new member in the `UserAgentType` enum in `backend/src/ee/services/audit-log/audit-log-types.ts`
   - Go: `GetUserAgentType` in `backend-go/internal/services/auditlog/useragent.go` (a port of the Node function; the two must stay in sync, and a mapping added to only one of them silently misclassifies traffic served by the other)
3. Match by prefix (`ua == "x"` or `startsWith("x/")`), not exact string, so version suffixes do not break classification. The `k8-operator` entry shows the pattern.

If you wrap an existing SDK (the Go SDK especially), set a distinct UA through its config instead of inheriting the SDK's default, otherwise your traffic is indistinguishable from every other consumer of that SDK.

## Funnel and wizard events need a denominator

If you add step events for a funnel or wizard, also emit an eligibility marker on the population event (e.g. a property like `wizardEligible: true/false` on the signup or entry event) so the denominator is computable in PostHog.

Lesson learned: the signup wizard events (`Signup Product Selected` etc., fired from `backend/src/server/routes/v3/signup-router.ts`) appear to fire for only ~9% of signups. Nothing is broken; invited users and SSO joiners never see the wizard by design. Without an eligibility marker, the funnel reads as 91% drop-off and nobody can tell breakage from ineligibility.

## Opt-out surfaces must stay honored

- Backend telemetry is gated on `TELEMETRY_ENABLED` (`backend/src/lib/config/env.ts`); the PostHog client is simply not constructed when it is false, and the same flag reaches the frontend as `TELEMETRY_CAPTURING_ENABLED` via `backend/src/server/plugins/serve-ui.ts`. Never add a capture path that bypasses this gate.
- The CLI (separate `Infisical/cli` repo) posts directly to PostHog and has its own `--telemetry` opt-out flag; changes to CLI telemetry must honor it.

## Definition of done

The PR description must list:

- Every event added or changed, with its full property list
- Which properties are breakdown dimensions (for aggregated events)
- How to verify the events in PostHog (event name to search for, expected properties, expected `channel`)

And the change must: route through `sendPostHogEvents`, carry the attribution fields above, use the aggregation pipeline if high-volume, register any new User-Agent in both backends, and honor the opt-out gates.
