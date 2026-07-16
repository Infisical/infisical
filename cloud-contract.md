# 17 - Infisical Cloud API contract

The client API surface consumed by **Infisical Cloud** (the cloud backend calling
with a service JWT). Reflects the dimension/commitment, self-serve trials, and
commitment-preview work. Items marked **NEW/CHANGED** changed in that work.

## Auth & conventions

- `Authorization: Bearer <service-JWT>` — HS256/RS256, claims `iss=infisical-cloud`,
  `aud=infisical-license-server`, `exp` required, `sub` = caller. Requires
  `SERVICE_JWT_ENABLED=true`.
- Org-addressed: every path is `/v1/organizations/{org_id}/…`.
- Every response carries `request_id`.
- A license-key caller (self-hosted) hits the same handlers at the un-org'd paths
  `/v1/entitlements`, `/v1/subscription`, `/v1/products`, `/v1/cloud-plan` with
  identical response shapes.

---

## GET `/v1/organizations/{org_id}/entitlements`
## POST `/v1/organizations/{org_id}/entitlements/refresh` (same shape, forces cache refresh)

```jsonc
{
  "license_id": "…", "org_id": "…",
  "account": { "sfdc_account_id": "…", "name": "…" },
  "billing_method": "paygo_stripe", "deployment_mode": "cloud",
  "status": "active",                                   // active | free | …
  "products": [
    { "product_key": "secrets_management", "plan_key": "pro",
      "status": "active",                               // active | trialing | grace | churned
      "trial_ends_at": null, "current_period_end": null }
  ],
  "features": {
    "max_identities": { "value": 100, "source": "plan", "from_product": "secrets_management" },
    "rbac":           { "value": true, "source": "default" }
  },
  "refresh_after": "2026-07-14T…Z", "etag": "…", "request_id": "…"
}
```

## GET `/v1/organizations/{org_id}/subscription` — CHANGED

```jsonc
{
  "status": "active",              // active | none | past_due | …
  "cadence": "monthly",            // top-level SUMMARY only; read per-dimension cadence below
  "currentPeriodEnd": 1786000000,  // unix | null
  "recurringTotal": 10400,         // cents | null
  "tier": "pro",
  "items": [
    {
      "productId": "secrets_management",
      "plan": "pro",
      "limits": { "seats": 100 },
      "amount": 10400,             // cents, omitempty
      "status": "active",          // active | trialing | grace | churned
      "isTrialing": false,
      "trialEndsAt": 1789000000,   // unix, omitempty
      "dimensions": [
        // Annual committed per_resource dimension (e.g. seats):
        { "key": "seats", "limitKey": "max_identities", "unit": "seat",
          "metered": false, "aggregation": "",
          "cadence": "annual",           // NEW: annual | monthly | "" (per dimension)
          "used": 120,                   // NEW-for-per_resource: latest reported reading
          "limit": 100,                  // feature cap (limit_key); NOT the commit floor
          "committed": 80,               // NEW-for-per_resource: prepaid commit quantity
          "committedRateCents": 2000,    // NEW: pinned annual per-unit rate
          "onDemandRateCents": 2300,     // NEW: pinned monthly per-unit (overage) rate
          "freeBand": null, "rateCents": null },
        // Monthly metered dimension (e.g. scans):
        { "key": "scans", "limitKey": "max_scans", "unit": "scan",
          "metered": true, "aggregation": "sum", "cadence": "monthly",
          "used": 140, "limit": 200,
          "committed": null, "committedRateCents": null, "onDemandRateCents": null,
          "freeBand": 50, "rateCents": 5 }
      ]
    }
  ],
  "request_id": "…"
}
```

Reading the dimension descriptors:

- **`cadence`** is per dimension: `annual` when it has a prepaid commit item (overflow then
  billed monthly on-demand), else the billed item's cadence, else `""` when not on the sub.
  The top-level `cadence` is only a summary; **do not** infer a dimension's cadence from it,
  and **do not** infer it from `committed != null`.
- **Rates are version-pinned** (grandfathering), so they reflect what the customer is billed,
  not the current catalog price. For a per_resource dimension read `committedRateCents`
  (annual) and `onDemandRateCents` (monthly overage). For a metered dimension read `rateCents`
  (per-unit) and `freeBand` (included quantity). `rateCents`/`freeBand` are null for
  per_resource; `committedRateCents`/`onDemandRateCents` are null for metered.
- **`committed` vs `limit` vs `used`:** for a yearly resource dimension the denominator is
  `committed` (the prepaid floor); on-demand overflow is `max(0, used - committed)`, costed
  client-side at `onDemandRateCents`. `limit` is the optional hard feature cap (`limit_key`)
  and is independent of `committed` (null when the dimension caps nothing). For a monthly
  metered dimension render `used / limit`; billing is `freeBand`-then-`rateCents`.

`status/isTrialing/trialEndsAt` come from trials; the per-dimension cadence/rates/committed/used
from the dimension+commitment work.

## GET `/v1/organizations/{org_id}/cloud-plan`

```jsonc
{ "currentPlan": { "memberLimit": 100, "identityLimit": 100 }, "request_id": "…" }
```

## POST `/v1/organizations/{org_id}/usage-snapshots` -> `202`

```jsonc
// request
{ "snapshots": [
  { "dimension_key": "seats", "value": 42, "observed_at": "2026-07-14T12:00:00Z",
    "source": "app", "idempotency_key": "unique-key-1" }
] }
// response
{ "request_id": "…", "results": [ { "idempotency_key": "unique-key-1", "status": "accepted" } ] }
// status: accepted | deduped
```

## GET `/v1/products`

The public product catalog for the pricing page. This is the **current published**
version for every product (the price list a buyer sees), NOT version-pinned to any
customer. For a customer's actual (grandfathered) rates use `/subscription`, not this.
Same shape for a license-key caller. There is no org in the path.

```jsonc
{
  "products": [
    {
      "id": "secrets_management",         // product key, joins to subscription items
      "name": "Secrets Management",
      "description": "…", "tagline": "…",  // omitempty
      "model": "per_seat", "addon": false,
      "icon": "shield", "color": "#…",
      "dimensions": [
        { "key": "secrets_identity", "label": "Identities", "noun": "identity" }
      ],
      "plans": [
        {
          "tier": "pro",                   // plan key
          "name": "Pro",
          "selfServe": true,
          "salesLed": false,
          "trialable": true,               // NEW: offers a self-serve trial
          "feature": null,                 // omitempty; gating feature key
          "basePriceMonthlyCents": 2000,   // omitempty
          "basePriceAnnualCents": 21600,   // omitempty
          "prices": [
            { "dimensionKey": "secrets_identity", "cadence": "monthly",
              "unitAmountCents": 2000, "includedQuantity": 5 },
            { "dimensionKey": "secrets_identity", "cadence": "annual",
              "unitAmountCents": 1800 }
          ]
        }
      ],
      "comparison": [
        { "label": "SSO", "cells": [ { "tier": "free", "value": false },
                                     { "tier": "pro",  "value": true } ] }
      ],
      "includes": [ "Everything in Free" ]
    }
  ],
  "request_id": "…"
}
```

- **`trialable`** gates the "Start trial" CTA: a plan is trialable only when
  `selfServe && trialable`, matching what `POST /billing/trial` accepts (else 404).
- `comparison[].cells[].value` is raw JSON: a bool (`true`) or a number-as-string (`"12"`).
- `prices[]` carries per_resource and metered dimension prices, keyed by
  `dimensionKey` + `cadence`; `includedQuantity` is the free band (metered).
- Trial duration is not exposed: self-serve trials are one monthly cycle (a Stripe
  Trial Offer), so there is no "N-day" field to render.

---

## POST `/v1/organizations/{org_id}/billing/checkout-session` — CHANGED

```jsonc
// request
{
  "items": [
    { "productId": "secrets_management", "plan": "pro", "cadence": "annual",
      "commitments": { "seats": 25 } }      // NEW: per-dimension committed qty.
  ],                                         //   REQUIRED for an annual per_resource line.
  "email": "buyer@acme.com",                 // required only for a brand-new customer
  "returnPath": "/billing"
}
// response
{ "outcome": "checkout_created", "checkoutUrl": "https://checkout.stripe.com/…", "request_id": "…" }
// outcome: checkout_created (hosted URL) | subscription_updated (appended to existing sub)
```

## POST `/v1/organizations/{org_id}/subscription/items` — CHANGED (same item shape incl. `commitments`)

```jsonc
{ "items": [ { "productId": "pam", "plan": "pro", "cadence": "annual", "commitments": { "resources": 10 } } ] }
// -> { "outcome": "subscription_updated", "subscriptionId": "sub_…", "request_id": "…" }
```

**One plan per product:** add-item and checkout-session reject (409) a product the org
already holds on a **paid or trialing** plan. To move plans within a product, remove it
first, then add the new plan (there is no implicit swap).

## DELETE `/v1/organizations/{org_id}/subscription/items/{product_id}?prorationDate=<unix>`

`-> { "outcome": "subscription_updated", "subscriptionId": "sub_…", "request_id": "…" }`
(immediate removal, prorated credit to the next invoice)

## POST `/v1/organizations/{org_id}/subscription/preview` — CHANGED

```jsonc
// request — any combination of the three
{
  "add":    [ { "productId": "pam", "plan": "pro", "cadence": "annual", "commitments": { "resources": 10 } } ],
  "remove": [ "cert_management" ],
  "commitmentChanges": [ { "dimensionKey": "seats", "quantity": 50 } ]   // NEW
}
// response
{
  "currency": "usd",
  "prorationAmount": 12000,       // signed cents: + charged now, - credit
  "nextInvoiceTotal": 30000,
  "nextRecurringTotal": 24000,
  "prorationDate": 1784050000,    // echo back into an apply for an exact match
  "lines": [ { "description": "…", "amount": -8000, "proration": true } ],
  "request_id": "…"
}
```

## POST `/v1/organizations/{org_id}/subscription/commitments` — NEW (self-serve apply)

Applies a commitment quantity change the caller previewed via `/subscription/preview`
(`commitmentChanges`). This is the self-serve counterpart to the admin-gated
`PUT /v1/admin/licenses/{id}/commitments/{dimension_key}`.

```jsonc
// request
{
  "dimensionKey": "seats",
  "quantity": 50,              // new prepaid commit quantity (>= 1)
  "prorationDate": 1784050000  // optional: echo the prorationDate from a preview so
}                              //   the billed amount matches; omit/0 prorates at now
// response
{ "outcome": "subscription_updated", "subscriptionId": "sub_…", "request_id": "…" }
```

- Only **per_resource** dimensions with an annual commit item are adjustable; a
  dimension with no commit item on the org's subscription is a `404`.
- `prorationDate` is validated against the same freshness window as a removal
  (`[now-15m, now+1m]`); a stale value is rejected so a caller cannot pin an
  arbitrary time to skew the prorated charge. Re-preview to get a fresh one.
- The prepaid quantity is pushed to Stripe (prorated) and the local mirror is
  re-synced immediately, so the next `GET /subscription` reflects the new `committed`.

## POST `/v1/organizations/{org_id}/subscription/cancel` · `…/resume`

`-> { "outcome": "subscription_updated", "subscriptionId": "sub_…", "request_id": "…" }`
(cancel = at period end; resume clears the scheduled cancel)

## POST `/v1/organizations/{org_id}/billing/trial` — NEW (plan-scoped)

```jsonc
// request — caller picks BOTH the product and the specific plan to trial
{ "product_key": "secrets_scanning", "plan_key": "pro" }
// response
{ "outcome": "trial_started", "request_id": "…" }
// outcome: trial_started | collect_payment_method (+ "checkout_url" to add a card, then re-call)
```

- `plan_key` is required; the plan must be `self_serve` + `trialable` on the product
  (else 404 "plan … is not a trialable self-serve plan").
- **One trial per product, ever** — `product_trials` is unique on `(org, product)`,
  so you may only trial a product once regardless of which plan you pick (anti-farming).
- **One plan per product** — 409 if the org already has a paid or trialing plan for
  the product. Switching is remove-then-add, not an implicit swap.
- The chosen plan is attached to the subscription: `GET /subscription` shows the
  product line with `plan`, `status:"trialing"`, `isTrialing:true`, `trialEndsAt`.

**Card-on-file vs no card:**
- **Card on file** (customer resolvable via subscription *or* `accounts.stripe_customer_id`) → the trial is attached directly and responds `trial_started`.
- **No card, existing customer** → responds `collect_payment_method` + `checkout_url` to a setup-mode Checkout carrying `{org_id, product_key, plan_key, intent:"trial"}` in metadata. When that Checkout completes, the `checkout.session.completed` (setup) webhook **captures the customer onto the account** and **auto-starts the plan-scoped trial** (idempotent under a per-org advisory lock) — no client re-call needed.
- **No customer at all** → `409` (do a checkout to establish billing first; Stripe setup mode requires a customer).

## POST `/v1/organizations/{org_id}/billing/portal-session`

```jsonc
{ "returnPath": "/billing" }  ->  { "url": "https://billing.stripe.com/…", "request_id": "…" }
```

## GET `/v1/organizations/{org_id}/billing/profile`

```jsonc
{
  "payment": { "brand": "visa", "last4": "4242", "expMonth": 12, "expYear": 2030 },  // or null
  "billingDetails": {
    "name": "…", "email": "…",
    "address": { "line1": "", "line2": "", "city": "", "state": "", "postalCode": "", "country": "" },
    "taxIds": [ { "type": "…", "value": "…" } ]
  },                                                                                  // or null
  "invoices": [ { "id": "in_…", "number": "…", "date": 1784000000, "amount": 10400, "paid": true, "pdfUrl": "…" } ],
  "request_id": "…"
}
```

---

## Commitment changes: preview then apply, both self-serve

A cloud caller can now do the full loop without a back-office step:

1. **Preview** — `POST /subscription/preview` with `commitmentChanges` returns the
   prorated impact plus a `prorationDate`.
2. **Apply** — `POST /subscription/commitments` with `{ dimensionKey, quantity, prorationDate }`
   applies it, echoing the previewed `prorationDate` so the charge matches the confirmation.

The **initial** commitment is still set at checkout via `commitments`; post-purchase
changes go through the pair above. The admin-session-gated
`PUT /v1/admin/licenses/{id}/commitments/{dimension_key}`
`{ "committed_quantity": <int>, "proration_date": <unix|omitted> }` remains for back-office
overrides. Only **per_resource** commitments are adjustable today (metered is not yet
supported by either surface).
