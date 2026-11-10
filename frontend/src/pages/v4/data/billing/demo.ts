import { useState } from "react";
import { useRouterState } from "@tanstack/react-router";

import type {
  BillingCatalogProduct,
  BillingEntitlementDim,
  BillingOverview,
  BillingUsageBreakdown
} from "@app/hooks/api/billing/types";
import { SubscriptionPlanTypes } from "@app/hooks/api/subscriptions/types";
import type { SubscriptionPlan } from "@app/hooks/api/types";

import type { BillingAdapter, BillingMutation, BillingQuery } from "./contract";

const SCENARIOS = [
  "default",
  "empty",
  "error",
  "denied",
  "loading",
  "past-due",
  "self-hosted"
] as const;
export type BillingScenario = (typeof SCENARIOS)[number];

export const useBillingScenario = () =>
  useRouterState({
    select: (state) => {
      const value = (state.location.search as { scenario?: unknown }).scenario;
      return SCENARIOS.find((scenario) => scenario === value) ?? "default";
    }
  });

const query = <T>(data: T | undefined, scenario: BillingScenario): BillingQuery<T> => ({
  data: scenario === "error" || scenario === "loading" ? undefined : data,
  isPending: scenario === "loading",
  isError: scenario === "error",
  error: scenario === "error" ? new Error("The billing service is unavailable.") : null,
  isFetching: false,
  isFetchedAfterMount: scenario !== "loading",
  isPlaceholderData: false,
  refetch: async () => undefined
});

const mutation =
  <TVariables, TData>(run: (variables: TVariables) => TData): BillingMutation<TVariables, TData> =>
  () => {
    const [state, setState] = useState<{ data?: TData; variables?: TVariables }>({});
    return {
      mutate: (variables, options) => {
        const data = run(variables);
        setState({ data, variables });
        options?.onSuccess?.(data);
      },
      mutateAsync: async (variables) => {
        const data = run(variables);
        setState({ data, variables });
        return data;
      },
      isPending: false,
      isError: false,
      data: state.data,
      variables: state.variables,
      reset: () => setState({})
    };
  };

const demoPortalUrl = () => window.location.href;

const plan = (overrides: Partial<SubscriptionPlan>) =>
  ({
    id: "demo-plan",
    slug: SubscriptionPlanTypes.Pro,
    tier: 1,
    memberLimit: 0,
    identityLimit: 0,
    auditLogs: true,
    auditLogsRetentionDays: 90,
    auditLogStreams: true,
    auditLogStreamLimit: 2,
    samlSSO: true,
    oidcSSO: true,
    ldap: false,
    scim: true,
    groups: true,
    rbac: true,
    enforceMfa: true,
    ipAllowlisting: false,
    subOrganization: false,
    status: "active",
    productPlans: [
      {
        productKey: "secrets_manager",
        planKey: "pro",
        status: "active",
        trialPlanKey: null,
        trialEndsAt: null
      },
      {
        productKey: "cert_management",
        planKey: "pro",
        status: "trialing",
        trialPlanKey: null,
        trialEndsAt: "2026-11-24"
      }
    ],
    ...overrides
  }) as SubscriptionPlan;

const identities: BillingEntitlementDim = {
  key: "secret_identities",
  label: "Secret identities",
  noun: "identity",
  unit: "identity",
  metered: false,
  cadence: "annual",
  used: 46,
  limit: null,
  committed: 50,
  commitAvailable: true,
  committedRate: 216,
  onDemandRate: 24,
  onDemandAmount: 0,
  canDecreaseNow: false,
  renewalDate: "Mar 14, 2027",
  decreaseAllowedFrom: "Feb 12, 2027"
};

const certDims: BillingEntitlementDim[] = [
  {
    key: "internal_cas",
    label: "Internal CAs",
    noun: "CA",
    unit: "CA",
    metered: false,
    cadence: null,
    used: 3,
    limit: 5,
    committed: null,
    commitAvailable: false,
    onDemandAmount: 0
  },
  {
    key: "active_certs",
    label: "Active certificates",
    noun: "certificate",
    unit: "certificate",
    metered: false,
    cadence: null,
    used: 412,
    limit: 500,
    committed: null,
    commitAvailable: false,
    onDemandAmount: 0
  },
  {
    key: "wildcard_certs",
    label: "Wildcard certificates",
    noun: "certificate",
    unit: "certificate",
    metered: false,
    cadence: null,
    used: 2,
    limit: 10,
    committed: null,
    commitAvailable: false,
    onDemandAmount: 0
  }
];

const productPlan = (
  tier: string,
  name: string,
  displayOrder: number,
  extra: Partial<BillingCatalogProduct["plans"][number]> = {}
): BillingCatalogProduct["plans"][number] => ({
  tier,
  name,
  selfServe: tier !== "enterprise",
  salesLed: tier === "enterprise",
  trialable: false,
  upgradeable: tier !== "enterprise",
  trialDays: 0,
  displayOrder,
  dims: [],
  ...extra
});

const catalog: BillingCatalogProduct[] = [
  {
    id: "secrets_manager",
    name: "Secrets Management",
    icon: "key_round",
    color: "",
    displayOrder: 1,
    tagline: "Store, sync and rotate secrets across every environment.",
    plans: [
      productPlan("pro", "Pro", 1, {
        base: { monthly: 0, annual: 0 },
        dims: [
          {
            key: "secret_identities",
            label: "Secret identities",
            noun: "identity",
            monthly: 24,
            annual: 216,
            included: 0
          }
        ]
      }),
      productPlan("advanced", "Advanced", 2, {
        trialable: true,
        trialDays: 14,
        dims: [
          {
            key: "secret_identities",
            label: "Secret identities",
            noun: "identity",
            monthly: 36,
            annual: 324,
            included: 0
          }
        ]
      }),
      productPlan("enterprise", "Enterprise", 3)
    ],
    compare: [
      { label: "Environments", cells: { pro: 3, advanced: 10, enterprise: "Unlimited" } },
      {
        label: "Audit log retention",
        cells: { pro: "30 days", advanced: "90 days", enterprise: "365 days" }
      },
      { label: "Dynamic secrets", cells: { pro: false, advanced: true, enterprise: true } },
      { label: "Secret rotation", cells: { pro: false, advanced: true, enterprise: true } },
      { label: "SCIM", cells: { pro: false, advanced: false, enterprise: true } }
    ]
  },
  {
    id: "cert_management",
    name: "Certificate Management",
    icon: "file_badge",
    color: "",
    displayOrder: 2,
    tagline: "Issue and renew certificates from your own CAs.",
    plans: [
      productPlan("pro", "Pro", 1, { base: { monthly: 99, annual: 990 } }),
      productPlan("enterprise", "Enterprise", 2)
    ],
    compare: [
      { label: "Internal CAs", cells: { pro: 5, enterprise: "Unlimited" } },
      { label: "ACME enrollment", cells: { pro: true, enterprise: true } },
      { label: "Certificate alerts", cells: { pro: true, enterprise: true } },
      { label: "External CA integrations", cells: { pro: false, enterprise: true } }
    ]
  },
  {
    id: "pam",
    name: "Privileged Access Management",
    icon: "users",
    color: "",
    displayOrder: 3,
    tagline: "Just-in-time access to servers and databases, with every session recorded.",
    plans: [
      productPlan("pro", "Pro", 1, {
        trialable: true,
        trialDays: 14,
        dims: [
          {
            key: "pam_identities",
            label: "PAM identities",
            noun: "identity",
            monthly: 30,
            annual: 288,
            included: 0
          }
        ]
      }),
      productPlan("enterprise", "Enterprise", 2)
    ]
  }
];

const activeOverview: BillingOverview = {
  isCloud: true,
  mode: "self-serve",
  subState: "active",
  planName: "Pro",
  billing: {
    monthlyRecurring: 0,
    annualCommitted: 10800,
    activeProductCount: 2,
    nextCharge: {
      amount: 10800,
      at: "Mar 14, 2027",
      productKeys: ["secrets_manager"],
      cadence: "annual",
      hasUsage: false,
      estimatedUsage: null
    }
  },
  onDemandAmount: 0,
  payment: { brand: "visa", last4: "4242", expMonth: 8, expYear: 2028 },
  billingDetails: {
    name: "Acme Corp",
    email: "billing@acme.dev",
    address: {
      line1: "548 Market St",
      line2: "Suite 300",
      city: "San Francisco",
      state: "CA",
      postalCode: "94104",
      country: "US"
    },
    taxIds: [{ type: "us_ein", value: "12-3456789" }]
  },
  invoices: [
    {
      id: "in_demo_3",
      number: "ACME-0003",
      date: "Mar 14, 2026",
      amount: 10800,
      paid: true,
      pdfUrl: null
    },
    {
      id: "in_demo_2",
      number: "ACME-0002",
      date: "Feb 14, 2026",
      amount: 1104,
      paid: true,
      pdfUrl: null
    },
    {
      id: "in_demo_1",
      number: "ACME-0001",
      date: "Jan 14, 2026",
      amount: 1104,
      paid: true,
      pdfUrl: null
    }
  ],
  entitlements: {
    secrets_manager: {
      entitled: true,
      planTier: "pro",
      cadence: "annual",
      amount: 10800,
      onDemandAmount: 0,
      status: "active",
      renewsOn: "Mar 14, 2027",
      dimensions: [identities]
    },
    cert_management: {
      entitled: true,
      planTier: "pro",
      cadence: "monthly",
      amount: 0,
      status: "trialing",
      isTrialing: true,
      trialEndsAt: "Nov 24, 2026",
      dimensions: certDims
    }
  },
  trialedProductKeys: ["cert_management"],
  trials: [],
  trialPaymentDue: null,
  paymentAlert: null,
  checkoutFrozen: false,
  selfServe: true
};

const emptyOverview: BillingOverview = {
  ...activeOverview,
  subState: "no-subscription",
  planName: "Free",
  billing: { monthlyRecurring: 0, annualCommitted: 0, activeProductCount: 0, nextCharge: null },
  payment: null,
  billingDetails: null,
  invoices: [],
  entitlements: {},
  trialedProductKeys: []
};

const pastDueOverview: BillingOverview = { ...activeOverview, subState: "past-due" };

const managedOverview: BillingOverview = {
  ...activeOverview,
  isCloud: false,
  mode: "managed",
  selfServe: false,
  payment: null,
  billingDetails: null,
  invoices: [],
  billing: { ...activeOverview.billing, nextCharge: null },
  entitlements: {
    secrets_manager: {
      entitled: true,
      planTier: "enterprise",
      status: "active",
      dimensions: [{ ...identities, committed: null, limit: 250, cadence: null }]
    }
  }
};

const overviewFor = (scenario: BillingScenario) => {
  if (scenario === "empty") return emptyOverview;
  if (scenario === "past-due") return pastDueOverview;
  if (scenario === "self-hosted") return managedOverview;
  return activeOverview;
};

const breakdown = (dimensionKey: string): BillingUsageBreakdown => ({
  dimensionKey,
  total: dimensionKey === "secret_identities" ? 46 : 412,
  userCount: dimensionKey === "secret_identities" ? 18 : 0,
  scopedCount: dimensionKey === "secret_identities" ? 28 : 412,
  hasProjectDetail: true,
  unit: "identity",
  scopes: [
    {
      orgId: "demo",
      name: "Acme Corp",
      isRoot: true,
      parentOrgName: null,
      count: dimensionKey === "secret_identities" ? 28 : 412,
      orgLevelCount: 4,
      projects: [
        { id: "payments-api", name: "Payments API", count: 12 },
        { id: "platform", name: "Platform", count: 8 },
        { id: "data-pipeline", name: "Data pipeline", count: 4 }
      ]
    }
  ]
});

const refreshDemoSubscription = async () => undefined;

export const billingDemo: BillingAdapter = {
  useSubscription: () => {
    const scenario = useBillingScenario();
    const subscription =
      scenario === "self-hosted"
        ? plan({ slug: SubscriptionPlanTypes.Enterprise, subOrganization: true })
        : plan(scenario === "empty" ? { productPlans: [] } : {});
    return query(subscription, scenario === "error" ? "default" : scenario);
  },
  useRefreshSubscription: () => refreshDemoSubscription,
  useOverview: () => {
    const scenario = useBillingScenario();
    return query(overviewFor(scenario), scenario);
  },
  useCatalog: () => {
    const scenario = useBillingScenario();
    return query(catalog, scenario);
  },
  useUsageBreakdown: (_orgId, dimensionKey) => {
    const scenario = useBillingScenario();
    return query(dimensionKey ? breakdown(dimensionKey) : undefined, scenario);
  },
  useOrganizations: () => {
    const scenario = useBillingScenario();
    return query(
      { organizations: [{ id: "demo", name: "Acme Corp", slug: "acme-corp" }], totalCount: 1 },
      scenario === "error" ? "default" : scenario
    );
  },
  useIsSubmitting: () => false,
  useCreatePortalSession: mutation(demoPortalUrl),
  useBuyProduct: mutation(() => ({ outcome: "subscription_updated" as const })),
  useAddPaymentMethod: mutation(demoPortalUrl),
  usePreviewChange: mutation(() => ({
    currency: "usd",
    prorationAmount: 0,
    additionalCharges: 0,
    totalDueNow: 0,
    nextInvoiceTotal: 10800,
    nextRecurringTotal: 10800,
    lines: [],
    toPlanVersionId: "demo-plan-version"
  })),
  useUpgradeProduct: mutation(() => ({ outcome: "upgraded" as const })),
  useChangeCommitment: mutation(() => ({ outcome: "subscription_updated" as const })),
  useStartTrial: mutation(() => ({ outcome: "trial_started" as const })),
  useConfirmTrialPayment: mutation(() => ({ outcome: "upgraded" as const })),
  useCancelTrial: mutation(() => ({ outcome: "trial_completed" as const })),
  useRemoveProduct: mutation(() => ({ outcome: "subscription_updated" as const })),
  useRefreshEntitlements: mutation(() => ({ success: true }))
};
