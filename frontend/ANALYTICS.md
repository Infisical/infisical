# Frontend analytics

Use `@app/lib/analytics` for new product analytics. The event catalog in
`src/lib/analytics/events.ts` is the contract between application code and
PostHog dashboards: every event has one canonical name and a typed property
shape.

## Capture an organization event

```ts
import { analytics, AnalyticsEvent } from "@app/lib/analytics";

analytics.captureForOrganization(AnalyticsEvent.PaywallViewed, orgId, {
  paywallText,
  sourcePath,
  isEnterpriseFeature
});
```

`captureForOrganization` adds `orgId` and the PostHog organization group. Do
not add those fields at call sites.

## Add an event

1. Add its canonical name to `AnalyticsEvent`.
2. Add its property contract to `OrganizationAnalyticsEventMap` or the
   appropriate scope map when one exists.
3. Capture it through the scope-specific analytics method.
4. Update the PostHog insight or dashboard that consumes it.

Event names describe completed facts in title case, such as `Paywall Viewed`
or `Billing Checkout Started`. Use stable machine-readable values for IDs,
plans, products, and other breakdowns; do not use display labels as
identifiers.

Properties must have bounded cardinality and must not contain secrets, raw
errors, arbitrary URLs, or unbounded user-entered content. Define an event's
firing condition precisely so lifecycle events such as viewed, clicked,
started, completed, failed, and canceled cannot overlap accidentally.

Browser events are appropriate for UI exposure and intent. Commercial,
security, and other authoritative outcomes should be emitted by the backend or
webhook processor when possible.

Legacy frontend telemetry still uses `Telemetry` directly. Migrate it through
the shared API rather than copying that pattern into new code. PLATFOR-817
tracks that migration and the remaining scope helpers.
