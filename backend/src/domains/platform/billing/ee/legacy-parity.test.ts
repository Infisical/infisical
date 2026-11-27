// Temporary: proves the domain answers exactly as the legacy license-v2 service did. Deleted with that service.
import { OrgMembershipRole, ProjectType } from "@app/db/schemas";
import { Meter, TCatalogProduct, TSubscriptionResponse } from "@app/domains/platform/license/ce/module";
import { licenseV2ServiceFactory } from "@app/ee/services/license-v2/license-v2-service";

import { catalogProduct, proPlan, subscription } from "./testing/billing-records";
import { buildBilling, SITE_URL } from "./testing/build-billing";

vi.mock("@app/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}));
vi.mock("@app/lib/request-context/oauth-delegation", () => ({ isScopeNarrowedRequest: () => false }));

const NOW = new Date("2026-11-27T12:00:00Z");
const sec = (iso: string) => Math.floor(new Date(iso).getTime() / 1000);

const richCatalog = (): { products: TCatalogProduct[] } => ({
  products: [
    catalogProduct({
      tagline: "Secrets",
      icon: "",
      comparison: [
        {
          label: "SSO",
          cells: [
            { tier: "pro", value: true },
            { tier: "enterprise", value: "custom" }
          ]
        }
      ],
      plans: [
        {
          tier: "free",
          name: "Free",
          selfServe: true,
          salesLed: false,
          trialable: false,
          upgradeable: false,
          deprecated: false,
          prices: []
        },
        proPlan({
          deprecated: true,
          deprecationReason: "Replaced",
          deprecationDate: "2027-01-15T00:00:00Z",
          prices: [
            ...proPlan().prices,
            {
              dimensionKey: "api_requests",
              cadence: "monthly",
              kind: "metered",
              unitAmountCents: 0,
              tiersMode: "volume",
              tiers: [
                { upTo: 1000, unitAmountDecimal: "0.5", flatAmountCents: 0 },
                { upTo: null, unitAmountDecimal: "0.25", flatAmountCents: 1000 }
              ]
            },
            { dimensionKey: "secret_identities", cadence: "monthly", kind: "mystery", unitAmountCents: 1 }
          ]
        }),
        {
          tier: "addon",
          name: "Add-on",
          selfServe: true,
          salesLed: false,
          trialable: true,
          upgradeable: true,
          deprecated: false,
          basePriceMonthlyCents: 4900,
          prices: []
        },
        {
          tier: "enterprise",
          name: "Enterprise",
          selfServe: false,
          salesLed: true,
          trialable: false,
          upgradeable: false,
          deprecated: false,
          prices: []
        }
      ]
    }),
    catalogProduct({
      id: "pam",
      name: "PAM",
      addon: true,
      deprecated: true,
      deprecationDate: sec("2027-03-01T00:00:00Z"),
      deprecationNextSteps: "Move to Agent Vault",
      dimensions: [
        { key: "pam_identities", label: "PAM identities", noun: "PAM identity", billingType: "per_resource" }
      ],
      plans: [
        proPlan({
          prices: [{ dimensionKey: "pam_identities", cadence: "annual", kind: "per_unit", unitAmountCents: 900 }]
        })
      ]
    })
  ]
});

const richSubscription = (): TSubscriptionResponse =>
  subscription({
    status: "past_due",
    capabilities: { checkoutFrozen: true, selfServe: false },
    payment: { state: "needs_action", actionUrl: "https://invoice.stripe.test/i" },
    billing: {
      monthlyRecurringCents: 12345,
      annualRecurringCents: 99000,
      nextChargeAt: sec("2026-12-16T00:00:00Z"),
      lines: [
        {
          productKey: "secrets_manager",
          cadence: "monthly",
          amountCents: 5000,
          usageBased: true,
          currentPeriodEnd: sec("2026-12-16T00:00:00Z"),
          estimatedAmountCents: 321
        },
        {
          productKey: "pam",
          cadence: "annual",
          amountCents: 99000,
          usageBased: false,
          currentPeriodEnd: sec("2026-12-16T00:00:00Z")
        },
        {
          productKey: "pam",
          cadence: "annual",
          amountCents: 1,
          usageBased: true,
          currentPeriodEnd: sec("2027-06-01T00:00:00Z"),
          estimatedAmountCents: 999
        }
      ]
    },
    items: [
      {
        productId: "secrets_manager",
        plan: "pro",
        amount: 5000,
        status: "active",
        quantities: {},
        limits: {},
        isTrialing: false,
        trialPlan: "advanced",
        trialPlanEndsAt: sec("2026-12-10T00:00:00Z"),
        trialPlanPaymentDueAt: null,
        trialPaymentDueAt: sec("2026-12-20T00:00:00Z"),
        dimensions: [
          {
            key: "secret_identities",
            used: 40,
            limit: 50,
            committed: 30,
            onDemandRateCents: 250,
            committedRateCents: 1500,
            cadence: "annual",
            commitAvailable: true,
            canDecreaseNow: false,
            renewalDate: sec("2027-11-27T00:00:00Z"),
            decreaseAllowedFrom: sec("2027-10-27T00:00:00Z")
          },
          {
            key: "api_requests",
            metered: true,
            used: 1500,
            limit: null,
            rateCents: 1,
            freeBand: 100,
            cadence: "monthly",
            usage: {
              periodStart: sec("2026-11-16T00:00:00Z"),
              periodEnd: sec("2026-12-16T00:00:00Z"),
              asOf: sec("2026-11-27T00:00:00Z"),
              estimatedAmountCents: 321,
              currentTier: 2,
              nextTierAt: null,
              earlierInPeriod: [
                {
                  periodStart: sec("2026-11-16T00:00:00Z"),
                  periodEnd: sec("2026-11-20T00:00:00Z"),
                  used: 10,
                  estimatedAmountCents: null
                }
              ],
              trial: false
            },
            pricing: {
              tiersMode: "graduated",
              tiers: [
                { upTo: 100, unitAmountDecimal: "0", flatAmountCents: 0 },
                { upTo: null, unitAmountDecimal: "1.5", flatAmountCents: 0 }
              ]
            }
          }
        ]
      } as never,
      {
        productId: "pam",
        plan: "pro",
        quantities: { pam_identities: 3 },
        limits: { pam_identities: 0 },
        isTrialing: true,
        trialEndsAt: sec("2026-12-01T00:00:00Z"),
        deprecation: { reason: "Contract text" },
        dimensions: []
      } as never
    ]
  });

const arrange = async ({ isCloud = true }: { isCloud?: boolean } = {}) => {
  const built = buildBilling({ config: { isCloud } });
  const { organizationsService, projectsService, root, sub } = built;
  organizationsService.orgNames = [
    { id: root.id, name: "acme", rootOrgId: null },
    { id: sub.id, name: "acme-sub", rootOrgId: root.id }
  ];
  projectsService.rows.set("p-1", {
    id: "p-1",
    name: "api",
    slug: "api",
    orgId: sub.id,
    type: ProjectType.SecretManager,
    enforceEncryptedSecretManagerSecretMetadata: false
  });
  const legacy = licenseV2ServiceFactory({
    envConfig: { isCloud, SITE_URL },
    orgDAL: { findById: (async (id: string) => organizationsService.findOrganization(id)) as never },
    orgPermissionService: (built.module as never as { billingOverviewService: { orgPermissionService: never } })
      .billingOverviewService.orgPermissionService,
    organizationsService,
    projectsService,
    breakdownDAL: {
      findOrgTreeNames: async (rootOrgId: string) =>
        (await organizationsService.listOrgTreeNames(rootOrgId)).map((org) => ({ ...org, isRoot: !org.rootOrgId })),
      findAllOrgNames: async () =>
        (await organizationsService.listAllOrgNames()).map((org) => ({ ...org, isRoot: !org.rootOrgId })),
      findProjectNames: async (ids: string[]) => projectsService.findProjectNames(ids),
      findAllRootOrgs: async ({ search, limit, offset }: { search?: string; limit: number; offset: number }) => {
        const page = await organizationsService.listRootOrganizations({ search, limit, offset });
        return { orgs: page.organizations, totalCount: page.totalCount };
      }
    },
    licenseService: built.licenseService,
    usageMeteringService: built.usageMeteringService,
    licenseBilling: built.licenseBilling
  });
  const admin = await built.member(OrgMembershipRole.Admin);
  return { ...built, legacy, admin };
};

type TBuilt = Awaited<ReturnType<typeof arrange>>;

// Runs the same call on legacy then on the domain, resetting what the fakes recorded in between, and returns both
// outcomes (result or error) with what each sent the License Server and which plan refreshes it asked for.
const both = async (built: TBuilt, call: (side: "legacy" | "domain") => Promise<unknown>) => {
  const { licenseBilling, licenseService } = built;
  const run = async (side: "legacy" | "domain") => {
    licenseBilling.calls = [];
    licenseService.refreshes = [];
    let outcome: unknown;
    try {
      outcome = { ok: JSON.parse(JSON.stringify(await call(side))) as unknown };
    } catch (error) {
      const err = error as { message: string; details?: unknown };
      outcome = { error: err.message, details: err.details };
    }
    return {
      outcome,
      sent: JSON.parse(JSON.stringify(licenseBilling.calls)) as unknown,
      refreshes: licenseService.refreshes
    };
  };
  return { legacy: await run("legacy"), domain: await run("domain") };
};

beforeEach(() => {
  vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
});
afterEach(() => {
  vi.useRealTimers();
});

describe("Billing parity with the legacy license-v2 service", () => {
  test.each([true, false])("should give the same overview (isCloud %s)", async (isCloud) => {
    // Setup
    const built = await arrange({ isCloud });
    built.licenseBilling.answer("getSubscription", richSubscription()).answer("getCatalog", richCatalog());
    built.licenseBilling.answer("getEntitlements", {
      features: { sso: { from_product: "kms" } as never, rbac: {} as never },
      products: [
        { product_key: "secrets_manager", plan_key: "enterprise", status: "active", trial_plan_key: "x" } as never,
        {
          product_key: "cert_manager",
          plan_key: "pro",
          status: "trialing",
          trial_ends_at: "2026-12-05T00:00:00Z"
        } as never,
        { product_key: "old", plan_key: "pro", status: "churned" } as never
      ]
    } as never);
    built.licenseBilling.answer("getBillingProfile", {
      payment: { brand: "visa", last4: "4242", expMonth: 1, expYear: 2030 },
      billingDetails: { name: "Acme", email: "billing@acme.test", address: null, taxIds: [] },
      invoices: [
        { id: "in_1", number: "A-1", date: sec("2026-11-01T00:00:00Z"), amount: 5000, paid: true, pdfUrl: null }
      ]
    } as never);
    built.licenseBilling.answer("getTrials", {
      trials: [
        {
          product_key: "pam",
          plan_key: "pro",
          base_plan_key: null,
          outcome: "converted",
          ended_reason: null,
          ended_detail: null,
          ended_at: sec("2026-10-01T00:00:00Z")
        }
      ]
    } as never);

    // Action
    const result = await both(built, (side) =>
      side === "legacy"
        ? built.legacy.getOverview({ orgId: built.root.id, actor: built.admin() })
        : built.module.billingOverviewService.getOverview({ orgId: built.root.id, actor: built.admin() })
    );

    // Assert
    expect(result.domain).toEqual(result.legacy);
  });

  test("should give the same catalog", async () => {
    // Setup
    const built = await arrange();
    built.licenseBilling.answer("getCatalog", richCatalog());

    // Action
    const result = await both(built, (side) =>
      side === "legacy"
        ? built.legacy.getCatalog({ orgId: built.root.id, actor: built.admin() })
        : built.module.billingOverviewService.getCatalog({ orgId: built.root.id, actor: built.admin() })
    );

    // Assert
    expect(result.domain).toEqual(result.legacy);
  });

  test.each([
    "identities",
    "user_identities",
    "secret_identities",
    "pam_identities",
    "internal_cas",
    "active_certs",
    "wildcard_certs"
  ])("should give the same %s breakdown", async (dimensionKey) => {
    // Setup
    const built = await arrange();
    const { root, sub } = built;
    const rows = [
      { orgId: sub.id, projectId: "p-1", count: 3 },
      { orgId: sub.id, projectId: "p-gone", count: 1 },
      { orgId: root.id, projectId: null, count: 2 },
      { orgId: "org-gone", projectId: null, count: 1 }
    ];
    built.organizationsService.countBillableOrgActors = async () => ({ users: 4, identities: 7 });
    built.organizationsService.getBillableIdentityOwnershipBreakdown = async () => rows;
    built.projectsService.countProjectIdentitiesByKind = async () => ({ users: 2, identities: 7 });
    built.projectsService.getProjectIdentityBreakdown = async () => rows;
    const certRows = rows.map((row) => ({ ...row, projectId: null }));
    built.usageMeteringService
      .setBreakdown(Meter.Identities, root.id, { total: 11, users: 4, rows })
      .setBreakdown(Meter.UserIdentities, root.id, { total: 4, users: 4, rows: [] })
      .setBreakdown(Meter.SecretIdentities, root.id, { total: 9, users: 2, rows })
      .setBreakdown(Meter.PamIdentities, root.id, { total: 9, users: 2, rows })
      .setBreakdown(Meter.InternalCas, root.id, { total: 7, users: 0, rows: certRows })
      .setBreakdown(Meter.ActiveCerts, root.id, { total: 7, users: 0, rows: certRows })
      .setBreakdown(Meter.WildcardCerts, root.id, { total: 7, users: 0, rows: certRows });

    // Action
    const result = await both(built, (side) =>
      side === "legacy"
        ? built.legacy.getUsageBreakdown({ orgId: root.id, actor: built.admin(), dimensionKey: dimensionKey as never })
        : built.module.usageBreakdownService.getUsageBreakdown({ orgId: root.id, actor: built.admin(), dimensionKey })
    );

    // Assert
    expect(result.domain.outcome).toEqual(result.legacy.outcome);
  });

  const purchases: [string, unknown][] = [
    ["checkout_created", { outcome: "checkout_created", checkoutUrl: "https://checkout.stripe.test/c" }],
    ["checkout without a link", { outcome: "checkout_created" }],
    ["subscription_updated", { outcome: "subscription_updated", subscriptionId: "sub_1" }],
    ["payment_action_required", { outcome: "payment_action_required", paymentUrl: "https://invoice.stripe.test/i" }],
    [
      "payment_action_required without a link",
      { outcome: "payment_action_required", paymentUrl: "ftp://invoice.stripe.test/i" }
    ]
  ];

  test.each(purchases)("should buy the same way for %s", async (_name, answer) => {
    // Setup
    const built = await arrange();
    built.usageMeteringService.counts.set(Meter.SecretIdentities, 12);
    built.licenseBilling.answer("getCatalog", richCatalog()).answer("buyProduct", answer as never);
    const input = {
      orgId: built.root.id,
      productId: "secrets_manager",
      cadence: "annual" as const,
      quantities: { secret_identities: 20 },
      email: "a@b.test",
      returnPath: "/x?y=1"
    };

    // Action
    const result = await both(built, (side) =>
      side === "legacy"
        ? built.legacy.buyProduct({ ...input, actor: built.admin() })
        : built.module.subscriptionService.buyProduct({ ...input, actor: built.admin() })
    );

    // Assert
    expect(result.domain).toEqual(result.legacy);
  });

  test.each([
    ["an addition", { addProductId: "secrets_manager", plan: "addon" }],
    ["an unknown addition", { addProductId: "nope" }],
    ["a sales-led addition", { addProductId: "secrets_manager", plan: "enterprise" }],
    [
      "an upgrade and removal",
      {
        upgradeProductId: "pam",
        upgradePlan: "pro",
        removeProductId: "secrets_manager",
        commitmentChanges: [{ dimensionKey: "k", quantity: 1 }]
      }
    ],
    ["nothing", {}],
    ["an upgrade without a plan", { upgradeProductId: "pam" }]
  ])("should preview %s the same way", async (_name, change) => {
    // Setup
    const built = await arrange();
    built.licenseBilling.answer("getCatalog", richCatalog()).answer("previewSubscriptionChange", {
      currency: "usd",
      prorationAmount: -150,
      additionalCharges: 0,
      nextInvoiceTotal: 1,
      nextRecurringTotal: 2,
      prorationDate: 5,
      lines: [{ description: "d", amount: 3, proration: false }]
    } as never);

    // Action
    const result = await both(built, (side) =>
      side === "legacy"
        ? built.legacy.previewChange({ orgId: built.root.id, actor: built.admin(), ...change })
        : built.module.subscriptionService.previewChange({ orgId: built.root.id, actor: built.admin(), ...change })
    );

    // Assert
    expect(result.domain).toEqual(result.legacy);
  });

  test.each([
    [
      "a current quote",
      sec("2026-11-27T11:50:00Z"),
      { outcome: "upgraded", subscriptionId: "s", fromPlanKey: "pro", toPlanKey: "adv" }
    ],
    ["a stale quote", sec("2026-11-27T11:44:59Z"), { outcome: "upgraded" }],
    ["a quote from the future", sec("2026-11-27T12:01:01Z"), { outcome: "upgraded" }],
    ["a held payment", undefined, { outcome: "payment_action_required", paymentUrl: "https://invoice.stripe.test/i" }]
  ])("should upgrade the same way for %s", async (_name, prorationDate, answer) => {
    // Setup
    const built = await arrange();
    built.licenseBilling.answer("upgradeProduct", answer as never);
    const input = { orgId: built.root.id, productId: "pam", plan: "adv", expectedPlanVersionId: "v", prorationDate };

    // Action
    const result = await both(built, (side) =>
      side === "legacy"
        ? built.legacy.upgradeProduct({ ...input, actor: built.admin() })
        : built.module.subscriptionService.upgradeProduct({ ...input, actor: built.admin() })
    );

    // Assert
    expect(result.domain).toEqual(result.legacy);
  });

  test.each([
    ["checkout_created", { outcome: "checkout_created", checkoutUrl: "https://c.test" }],
    ["checkout without a link", { outcome: "checkout_created" }],
    ["subscription_updated", { outcome: "subscription_updated", subscriptionId: "s" }],
    ["payment_action_required", { outcome: "payment_action_required", paymentUrl: "https://p.test" }]
  ])("should change commitments the same way for %s", async (_name, answer) => {
    // Setup
    const built = await arrange();
    built.licenseBilling.answer("changeCommitments", answer as never);
    const input = {
      orgId: built.root.id,
      productId: "secrets_manager",
      changes: [{ dimensionKey: "secret_identities", quantity: 9 }]
    };

    // Action
    const result = await both(built, (side) =>
      side === "legacy"
        ? built.legacy.changeCommitments({ ...input, actor: built.admin() })
        : built.module.subscriptionService.changeCommitments({ ...input, actor: built.admin() })
    );

    // Assert
    expect(result.domain).toEqual(result.legacy);
  });

  test.each([
    ["trial_started", "secrets_manager", { outcome: "trial_started" }],
    ["awaiting_card", "secrets_manager", { outcome: "awaiting_card", cardSetupUrl: "https://setup.test" }],
    ["an unlisted product", "nope", { outcome: "trial_started" }]
  ])("should start a trial the same way for %s", async (_name, productId, answer) => {
    // Setup
    const built = await arrange();
    built.usageMeteringService.counts.set(Meter.SecretIdentities, 3);
    built.licenseBilling.answer("getCatalog", richCatalog()).answer("startTrial", answer as never);
    const input = { orgId: built.root.id, productId, plan: "pro", email: "a@b.test" };

    // Action
    const result = await both(built, (side) =>
      side === "legacy"
        ? built.legacy.startTrial({ ...input, actor: built.admin() })
        : built.module.trialService.startTrial({ ...input, actor: built.admin() })
    );

    // Assert
    expect(result.domain).toEqual(result.legacy);
  });

  test.each([
    ["checkout_created", { outcome: "checkout_created", checkoutUrl: "https://c.test" }],
    ["an insecure checkout", { outcome: "checkout_created", checkoutUrl: "http://c.test" }],
    ["payment_action_required", { outcome: "payment_action_required", paymentUrl: "https://p.test" }],
    ["upgraded", { outcome: "upgraded" }]
  ])("should confirm a trial payment the same way for %s", async (_name, answer) => {
    // Setup
    const built = await arrange();
    built.licenseBilling.answer("confirmTrialPayment", answer as never);

    // Action
    const result = await both(built, (side) =>
      side === "legacy"
        ? built.legacy.confirmTrialPayment({ orgId: built.root.id, actor: built.admin() })
        : built.module.trialService.confirmTrialPayment({ orgId: built.root.id, actor: built.admin() })
    );

    // Assert
    expect(result.domain).toEqual(result.legacy);
  });

  test("should open the portal, cancel a trial and remove a product the same way", async () => {
    // Setup
    const built = await arrange();
    built.licenseBilling
      .answer("createPortal", { url: "https://portal.test" })
      .answer("cancelTrial", { outcome: "trial_completed" })
      .answer("removeProduct", { outcome: "subscription_updated", subscriptionId: "s" });
    const actor = built.admin;
    const orgId = built.root.id;

    // Action
    const results = await Promise.all([
      both(built, (side) =>
        side === "legacy"
          ? built.legacy.portalSession({ orgId, actor: actor(), returnPath: "//evil" })
          : built.module.subscriptionService.openPortal({ orgId, actor: actor(), returnPath: "//evil" })
      ),
      both(built, (side) =>
        side === "legacy"
          ? built.legacy.cancelTrial({ orgId, actor: actor(), productId: "p" })
          : built.module.trialService.cancelTrial({ orgId, actor: actor(), productId: "p" })
      ),
      both(built, (side) =>
        side === "legacy"
          ? built.legacy.removeProduct({ orgId, actor: actor(), productId: "p" })
          : built.module.subscriptionService.removeProduct({ orgId, actor: actor(), productId: "p" })
      )
    ]);

    // Assert
    results.forEach((result) => expect(result.domain).toEqual(result.legacy));
  });

  test.each([
    ["a member reading", OrgMembershipRole.Member, "read"],
    ["a member buying", OrgMembershipRole.Member, "buy"],
    ["a stranger reading", null, "read"]
  ] as const)("should refuse %s the same way", async (_name, role, action) => {
    // Setup
    const built = await arrange();
    const actor = await built.member(role);
    built.licenseBilling.answer("getCatalog", richCatalog());

    // Action
    const result = await both(built, (side) => {
      if (action === "read") {
        return side === "legacy"
          ? built.legacy.getOverview({ orgId: built.root.id, actor: actor() })
          : built.module.billingOverviewService.getOverview({ orgId: built.root.id, actor: actor() });
      }
      return side === "legacy"
        ? built.legacy.buyProduct({ orgId: built.root.id, actor: actor(), productId: "secrets_manager" })
        : built.module.subscriptionService.buyProduct({
            orgId: built.root.id,
            actor: actor(),
            productId: "secrets_manager"
          });
    });

    // Assert
    expect(result.domain).toEqual(result.legacy);
  });
});
