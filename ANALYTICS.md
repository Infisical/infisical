# Product analytics

Use this guide for product analytics emitted to PostHog from the frontend,
backend, workers, and lifecycle/webhook processors. An event is a durable data
contract: define what it means and who owns it before adding a capture call or
dashboard.

## Design an event

Answer these questions before implementation:

1. **Question:** Which product decision will this event inform? Do not collect
   data without a concrete consumer.
2. **Owner:** Which single producer can establish the fact most reliably?
3. **Firing condition:** What exact transition emits it, and can retries or
   rerenders emit it twice?
4. **Source of truth:** Is this UI intent, an accepted command, or a durable
   domain outcome?
5. **Scope:** Is the subject a person, organization, project, instance, or
   another bounded entity?
6. **Dimensions:** Which stable identifiers are needed for breakdowns? Keep
   display copy separate from machine-readable keys.
7. **Cardinality and privacy:** Can any property contain secrets, raw errors,
   concrete URLs, resource IDs used as breakdowns, or unbounded user input?
8. **Attribution:** Is an organization and time window sufficient, or does the
   flow require a correlation ID propagated to its authoritative outcome?
9. **Consumer:** Which insight or dashboard uses the event, and how will its
   query distinguish intent from conversion?

## Event ownership

Each event has one owning producer. Do not emit the same event name from the
frontend and backend: doing so mixes browser observations with domain outcomes
and double-counts web activity.

The frontend owns UI exposure, navigation, and intent that no server can
observe, such as a modal being viewed or a CTA being selected.

The application backend owns accepted commands and external sessions it
successfully creates. Emit properties from normalized or resolved service
state, not optional request inputs when they can differ.

The system that commits or reconciles a durable transition owns authoritative
outcomes. Subscription activation, payment, trial conversion, and similar
events normally belong to the license or webhook lifecycle rather than a
browser return page.

Name events after the fact their owner can prove. For example,
`Billing Checkout Session Created` is a backend fact; `Subscription Activated`
is a billing-lifecycle fact.

## Frontend events

Use `@app/lib/analytics` for new frontend product analytics. The event catalog
in `frontend/src/lib/analytics/events.ts` is the contract between application
code and PostHog dashboards: every event has one canonical name and a typed
property shape.

```ts
import { analytics, AnalyticsEvent } from "@app/lib/analytics";

analytics.captureForOrganization(AnalyticsEvent.PaywallViewed, orgId, {
  paywallKey,
  paywallText,
  route,
  isEnterpriseFeature
});
```

`captureForOrganization` adds `orgId` and the PostHog organization group. Do
not add those fields at call sites. Analytics initialization remains lazy; do
not instantiate the client at module scope.

To add a frontend event:

1. Add its canonical name to `AnalyticsEvent`.
2. Add its property contract to `OrganizationAnalyticsEventMap` or the
   appropriate scope map when one exists.
3. Capture it through the scope-specific analytics method.
4. Update the PostHog insight or dashboard that consumes it.

Legacy frontend telemetry still uses `Telemetry` directly. Migrate it through
the shared API rather than copying that pattern into new code. Preserve
existing identity and feature-flag behavior during migration.

## Backend events

Define backend event names and discriminated property types in
`backend/src/services/telemetry/telemetry-types.ts`. Emit organization-scoped
events with `organizationId` so the telemetry service attaches the PostHog
organization group and refreshes its properties.

Fire an event only after the operation named by the event succeeds. Use the
resolved service result for normalized plans, cadence, provider type, and
other dimensions. When delivery is best-effort, follow the established
fire-and-forget pattern without changing the API response or error behavior.

## Properties and naming

Event names describe completed facts in title case. Use stable
machine-readable values for plans, products, capabilities, and other
breakdowns; do not use display labels as identifiers.

Properties must have bounded cardinality and must not contain secrets, raw
errors, arbitrary URLs, or unbounded user-entered content. Define lifecycle
terms such as viewed, clicked, created, succeeded, failed, and canceled so they
cannot overlap accidentally.

Every paywall has a required, lowercase dot-separated `paywallKey` owned by
its call site. Keep the key stable when copy or plan names change; use modal
text only as display context. Record the matched route ID, not a concrete URL
containing organization, project, or resource identifiers.

## Review an analytics change

Before opening or approving a pull request:

- Check the frontend and backend catalogs for a semantic duplicate.
- Trace every property to the executed state, not only the request payload.
- Verify shared-component callers supply stable identity at compile time.
- Check module-scope code and constructors for initialization side effects.
- Confirm retries, rerenders, and webhook redelivery cannot inflate counts.
- Run the saved PostHog queries and verify their breakdown fields match the
  typed event contract.
- Keep pull request and ticket references out of durable repository guidance.
