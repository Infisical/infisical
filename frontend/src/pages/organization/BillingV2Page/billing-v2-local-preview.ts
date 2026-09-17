/* eslint-disable */
// ---------------------------------------------------------------------------------------------
//
// To remove: delete this file and the LOCAL_PREVIEW block in BillingV2Page.tsx.
// ---------------------------------------------------------------------------------------------
// ONE SWITCH for reviewing the layout. Flip this, save, and the page re-renders:
//
//   "cloud"         paying cloud customer: header tiles, payment card, invoices, no org picker
//   "cloud-managed" enterprise-managed cloud: Managed Billing notice, no Stripe sections
//   "self-hosted" licensed instance: managed copy, instance-admin org picker, no Stripe cards
//   "offline"     air-gapped licence: the standalone OfflineBillingPage (nothing from this feature)
//   "off"         no faking at all; on a dev stack this shows "No products available"
// The usage
export type PreviewMode = "cloud" | "cloud-managed" | "self-hosted" | "offline" | "off";
export const PREVIEW_MODE: PreviewMode = "self-hosted";

import { useMemo } from "react";
import { keepPreviousData, useQueries } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";
import {
  BillingV2BreakdownScopeKind,
  BillingV2CatalogProduct,
  BillingV2Entitlement,
  BillingV2EntitlementDim,
  BillingV2Overview,
  BillingV2UsageBreakdown
} from "@app/hooks/api";

const dim = (key: string, label: string, noun: string, used: number): BillingV2EntitlementDim => ({
  key,
  label,
  noun,
  unit: noun,
  metered: true,
  cadence: "monthly",
  used,
  limit: null,
  committed: null,
  commitAvailable: false,
  onDemandAmount: 0
});

// A dimension the customer is eligible to commit annually but has not: the shape commitSavingsNudge
// looks for (dimCommittable = commitAvailable && !metered, no commitment, used > 0, both rates set).
// Rates are chosen so the savings come out around a third, which is what the strip prints.
const commitDim = (
  key: string,
  label: string,
  noun: string,
  used: number
): BillingV2EntitlementDim => ({
  key,
  label,
  noun,
  unit: noun,
  metered: false,
  cadence: "monthly",
  used,
  limit: null,
  committed: null,
  commitAvailable: true,
  committedRate: 40,
  onDemandRate: 5,
  onDemandAmount: 0
});

const product = (
  id: string,
  name: string,
  icon: string,
  color: string,
  tagline: string
): BillingV2CatalogProduct => ({
  id,
  name,
  icon,
  color,
  tagline,
  // Sales-led, so an unentitled product renders "Contact sales" rather than an Activate button, which
  // is what production shows for these.
  plans: [
    {
      tier: "enterprise",
      name: "Enterprise",
      selfServe: false,
      salesLed: true,
      trialable: false,
      upgradeable: false,
      trialDays: 0,
      dims: []
    }
  ]
});

// Icon tokens and colours are approximations taken from a production screenshot, not the real catalog:
// a dev stack has no licence server to read it from. Expect these to differ from production in detail.
export const PREVIEW_CATALOG: BillingV2CatalogProduct[] = [
  product(
    "legacy_secrets",
    "Legacy Secret Management",
    "key_round",
    "#7d7f80",
    "The original per-identity secret management plan."
  ),
  product(
    "secrets",
    "Secrets Management",
    "key_round",
    "#e0ed34",
    "Store, manage, and sync secrets across your stack."
  ),
  product(
    "pki",
    "Certificate Management",
    "file_check",
    "#ed8c34",
    "Issue and manage X.509 certificates and private CAs."
  ),
  product(
    "pam",
    "Privileged Access Management",
    "user_round_plus",
    "#ff3568",
    "Secure, broker, and audit privileged access."
  )
];

// The licence server is what a dev stack lacks; the breakdown endpoint is local, scope-aware and
// reads the same tables the meters do. Pointing the cards at it makes every figure real and makes the
// organization picker move them: "All organizations" counts the whole database, one organization
// counts its tree. The numbers below are the fallback for a dimension whose request has not landed.
export const PREVIEW_DIMENSION_KEYS = [
  "identities",
  "user_identities",
  "secret_identities",
  "pam_identities",
  "internal_cas",
  "active_certs",
  "wildcard_certs"
] as const;

export type PreviewUsage = Partial<Record<(typeof PREVIEW_DIMENSION_KEYS)[number], number>>;

// Off and offline fake nothing, so nothing is fetched for them either.
const INERT_MODES: PreviewMode[] = ["off", "offline"];
const IS_PREVIEW_ACTIVE = !INERT_MODES.includes(PREVIEW_MODE);

export const previewEntitlements = (usage: PreviewUsage = {}): Record<string, BillingV2Entitlement> => ({
  // Two dimensions, as production shows: the combined identity meter plus the human-seat one.
  legacy_secrets: {
    entitled: true,
    planTier: "enterprise",
    cadence: "annual",
    renewsOn: "November 3, 2026",
    dimensions: [
      dim("identities", "Identities", "identity", usage.identities ?? 25),
      dim("user_identities", "User Identities", "user identity", usage.user_identities ?? 10)
    ]
  },
  secrets: {
    entitled: true,
    planTier: "enterprise",
    cadence: "monthly",
    dimensions: [dim("secret_identities", "Secret Identities", "secret identity", usage.secret_identities ?? 15)]
  },
  // Several breakdownable dimensions, so the sheet renders its unit tabs. internal_cas is committable
  // here, which is also what makes this the card that shows the breakdown strip and the commit nudge
  // at the same time — the two are independent, so review how they stack.
  pki: {
    entitled: true,
    planTier: "enterprise",
    cadence: "monthly",
    dimensions: [
      commitDim("internal_cas", "Internal CAs", "internal CA", usage.internal_cas ?? 23),
      dim("active_certs", "Active Certificates", "active certificate", usage.active_certs ?? 134),
      dim("wildcard_certs", "Wildcard Certificates", "wildcard certificate", usage.wildcard_certs ?? 23)
    ]
  },
  pam: {
    entitled: true,
    planTier: "enterprise",
    cadence: "monthly",
    dimensions: [dim("pam_identities", "PAM Identities", "PAM identity", usage.pam_identities ?? 54)]
  }
});

export const PREVIEW_ENTITLEMENTS = previewEntitlements();

// One request per previewed dimension, keyed on the picked organization and scope, so switching the
// picker refetches and the cards move with it.
export const usePreviewUsage = (orgId: string, scope: BillingV2BreakdownScopeKind): PreviewUsage => {
  const results = useQueries({
    queries: PREVIEW_DIMENSION_KEYS.map((key) => ({
      queryKey: ["billing-v2-preview-usage", orgId, key, scope] as const,
      queryFn: async () => {
        const {
          data: { breakdown }
        } = await apiRequest.get<{ breakdown: BillingV2UsageBreakdown }>(
          `/api/v1/organizations/${orgId}/billing/v2/breakdowns/${key}`,
          { params: { scope } }
        );
        return breakdown.total;
      },
      enabled: Boolean(orgId) && IS_PREVIEW_ACTIVE,
      placeholderData: keepPreviousData,
      retry: false
    }))
  });

  const totals = results.map((result) => result.data);
  return useMemo(
    () =>
      Object.fromEntries(
        PREVIEW_DIMENSION_KEYS.map((key, index) => [key, totals[index]]).filter(
          ([, total]) => total !== undefined
        )
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    totals
  );
};

// Two real cloud shapes, because they render very differently and both are worth reviewing.
//
// "cloud" is a paying self-serve customer: an active Stripe subscription, so the page shows the header
// stat tiles, the payment method card, the billing details card and the invoice list.
const CLOUD_BASE = {
  isCloud: true as const,
  mode: "self-serve" as const,
  checkoutFrozen: false,
  planName: "Enterprise"
};

export const asCloudOverview = (
  overview: BillingV2Overview,
  entitlements: Record<string, BillingV2Entitlement>
): BillingV2Overview => ({
  ...overview,
  ...CLOUD_BASE,
  entitlements,
  subState: "active",
  selfServe: true,
  billing: {
    monthlyRecurring: 1240,
    annualCommitted: 18000,
    activeProductCount: PREVIEW_CATALOG.length,
    nextCharge: {
      amount: 1240,
      at: "October 1, 2026",
      productKeys: ["secrets"],
      cadence: "monthly",
      hasUsage: true
    }
  },
  onDemandAmount: 84,
  payment: { brand: "visa", last4: "4242", expMonth: 11, expYear: 2028 },
  billingDetails: {
    name: "Admin Org",
    email: "billing@example.com",
    address: {
      line1: "1 Example Street",
      city: "San Francisco",
      state: "CA",
      postalCode: "94105",
      country: "US"
    },
    taxIds: []
  },
  invoices: [
    {
      id: "in_3",
      number: "INV-0003",
      date: "September 1, 2026",
      amount: 1240,
      paid: true,
      pdfUrl: null
    },
    {
      id: "in_2",
      number: "INV-0002",
      date: "August 1, 2026",
      amount: 1240,
      paid: true,
      pdfUrl: null
    },
    { id: "in_1", number: "INV-0001", date: "July 1, 2026", amount: 1156, paid: true, pdfUrl: null }
  ]
});

// "cloud-managed" is an enterprise-managed cloud org, which is what a real production account looked
// like: contract-billed, so there is no Stripe subscription and none of those sections render. selfServe
// false is what raises the Managed Billing notice.
//
// One thing this cannot reproduce: production also shows a Manage button on the active product. On this
// branch that needs overview.selfServe true, the same flag the Managed Billing notice needs false, so
// the two cannot both render. Production is on an older build where they could.
export const asManagedCloudOverview = (
  overview: BillingV2Overview,
  entitlements: Record<string, BillingV2Entitlement>
): BillingV2Overview => ({
  ...overview,
  ...CLOUD_BASE,
  entitlements,
  subState: "no-subscription",
  selfServe: false,
  billing: { monthlyRecurring: 0, annualCommitted: 0, activeProductCount: 1, nextCharge: null },
  onDemandAmount: 0,
  payment: null,
  billingDetails: null,
  invoices: []
});
