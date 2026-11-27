# Billing domain

The billing portal an org's billing admins use: what the org holds and pays (overview), what it can buy (catalog),
self-serve checkout, plan upgrades, commitments, trials, the Stripe portal, usage breakdowns, and the org plan reads
(`/plan`, `/plans`). It sits on Organizations, Projects and License (Billing Core); nothing imports it.

EE only (`ee/`). There is no `ce/module.ts`, so `domains.ts` re-exports its routers and
service types for `ee/routes/v1/index.ts` and `@types/fastify.d.ts`.

**Owns no tables.** The License Server holds the subscription, catalog and trials; License holds the plan cache and
the meters; Organizations and Projects hold names. So there are no stores and no `TransactionRunner`: services read other domains and call the
License Server, and write nothing of their own.

| Layer | Holds |
| --- | --- |
| `ee/models/` | The billing rules: `CatalogProduct`/`CatalogPlan` (which plan is sold, how a price is charged), `ProductLineItem` (usage a purchase declares), `ChangePreviewRequest`, `ProrationQuote`, `ReturnUrl`, `PaymentLink`, `Subscription`, `EntitlementSet`, `TrialHistory`, `BreakdownDimension`, `UsageBreakdown`, `BillingAccess`, and display helpers (`Money`, `BillingDate`, `Deprecation`, `PriceBands`) |
| `ee/services/` | `billing-overview/` (overview, catalog, refresh, org plan), `usage-breakdown/`, `subscription/`, `trial/`; `helpers/` for the permission checks, line items and the payment-approval outcome |
| `ee/router/` | `billing-router.ts` (`/organizations/:id/billing/v2/...`) and `org-plan-router.ts`. Zod schemas and PostHog telemetry live here |
| `ee/testing/` | `buildBilling()` (real org permission service over in-memory Access Control, fakes for the rest), the scriptable `FakeLicenseServerBilling`, License Server record fixtures |

Rules:

- **Billing belongs to the root org.** Reads and changes check `OrgPermissionSubjects.Billing` at
  `OrganizationActionScope.ParentOrganization` (`assertBillingRead`, `assertManageBilling`), so a sub-org is refused.
  `/plan` is the exception: any member of any org in the tree reads the root's plan.
- **Instance-admin reach is self-hosted only** (`BillingAccess`). A self-hosted license covers every org, so its
  instance admins read any org's overview, catalog, breakdowns and billable orgs without membership. Never on cloud,
  never with a token narrowed to OAuth scopes, never for a change, and never for `refreshEntitlements`. It reads the
  principal (`isSuperAdmin`, `isInstanceAdmin`, `oauth.scopes`), never the request context.
- **Revalidate the plan after every change, with the right window.** `licenseService.refreshPlan(orgId, {
  afterBillingChange: { checkout: true } })` when the change only applies after the customer finishes in Stripe
  (checkout, card setup, payment approval); `{}` when it applied in place. A wrong window either shows a stale plan or
  hammers the License Server.
- **Seed purchases with live usage** (`resolveLineItem`): per-unit dimensions are counted through
  `usageMeteringService.countUsage`, so the preview and the charge match what the org has. Metered dimensions are
  never sold as a quantity.
- **Breakdowns come from License, never a product.** `usageMeteringService.getUsageBreakdown(meter, scope)` with the
  root org (or `null` instance-wide); Billing only adds names and presentation (`BreakdownDimension`). A new metered
  product adds its `breakdown` to its own `TUsageCounter`, and a `BreakdownDimension` here if it should be shown.
- **The overview degrades, except for the subscription.** Billing profile, catalog, entitlements and trials failures
  are logged and shown empty; a failed subscription read fails the page rather than showing the org as free.
- **Links to the browser are https only** (`PaymentLink`), and return URLs stay on `SITE_URL`'s origin (`ReturnUrl`);
  a missing `SITE_URL` is an `ExternalSystemError` (500), not the buyer's fault.
- **Keep the contract.** URLs, operationIds, schemas, error messages and `details.code = "payment_action_required"`
  are what the frontend (`frontend/src/hooks/api/billing/`) and the Go blackbox suite (`tests/suites/organization/`)
  depend on.
