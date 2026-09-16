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
or `Paywall Upgrade Clicked`. Use stable machine-readable values for IDs,
plans, products, and other breakdowns; do not use display labels as
identifiers.

Properties must have bounded cardinality and must not contain secrets, raw
errors, arbitrary URLs, or unbounded user-entered content. Define an event's
firing condition precisely so lifecycle events such as viewed, clicked,
started, completed, failed, and canceled cannot overlap accidentally.

Each event has one owning producer. Do not emit the same event name from the
frontend and backend: doing so mixes browser observations with domain outcomes
and overcounts activity that originated from the web application.

The frontend owns UI exposure, navigation, and intent, such as a modal being
viewed, a button being selected, or the browser returning from a hosted flow.
Name these events after what the browser actually observed; for example,
`Billing Checkout Success Return Viewed` rather than `Checkout Completed`.

The backend owns accepted, succeeded, failed, and other decisive product
outcomes across web, CLI, machine identities, and every other client. Before
adding a frontend event, check the backend event catalog and capture only the
UI context that its route telemetry cannot provide.

Legacy frontend telemetry still uses `Telemetry` directly. Migrate it through
the shared API rather than copying that pattern into new code. PLATFOR-817
tracks that migration and the remaining scope helpers.
