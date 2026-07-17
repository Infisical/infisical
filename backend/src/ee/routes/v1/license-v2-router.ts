import { FastifyRequest } from "fastify";
import { z } from "zod";

import { NotFoundError } from "@app/lib/errors";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

// The license server joins this onto its configured portal origin, so it must be a single-rooted
// relative path. Reject protocol-relative ("//host", "/\\host") values that browsers can normalize
// into a host override and use to redirect users off Infisical after the Stripe flow.
const ReturnPathSchema = z
  .string()
  .trim()
  .startsWith("/")
  .refine((path) => !path.startsWith("//") && !path.startsWith("/\\"), {
    message: "must be a relative path"
  })
  .optional();

const BillingV2DimSchema = z.object({
  key: z.string(),
  label: z.string(),
  noun: z.string(),
  monthly: z.number(),
  annual: z.number(),
  included: z.number(),
  meteredMonthly: z.boolean().optional(),
  meteredAnnual: z.boolean().optional()
});

const BillingV2CompareRowSchema = z.object({
  label: z.string(),
  // Cells keyed by plan tier so the UI renders one column per plan.
  cells: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()]))
});

const BillingV2PlanSchema = z.object({
  tier: z.string(),
  name: z.string(),
  selfServe: z.boolean(),
  salesLed: z.boolean(),
  trialable: z.boolean(),
  displayOrder: z.number().optional(),
  feature: z.string().optional(),
  base: z.object({ monthly: z.number(), annual: z.number() }).optional(),
  dims: BillingV2DimSchema.array()
});

const BillingV2CatalogProductSchema = z.object({
  id: z.string(),
  name: z.string(),
  icon: z.string(),
  color: z.string(),
  addon: z.boolean().optional(),
  tagline: z.string().optional(),
  displayOrder: z.number().optional(),
  plans: BillingV2PlanSchema.array(),
  includes: z.string().array().optional(),
  compare: BillingV2CompareRowSchema.array().optional()
});

const BillingV2InvoiceSchema = z.object({
  id: z.string(),
  number: z.string(),
  date: z.string(),
  amount: z.number(),
  paid: z.boolean(),
  pdfUrl: z.string()
});

const BillingV2EntitlementDimSchema = z.object({
  key: z.string(),
  label: z.string(),
  noun: z.string(),
  unit: z.string(),
  metered: z.boolean(),
  cadence: z.enum(["monthly", "annual"]).nullable(),
  used: z.number(),
  limit: z.number().nullable(),
  committed: z.number().nullable(),
  // Rates in dollars. per_resource dims: committedRate (annual) + onDemandRate (monthly overage);
  // metered dims: rate (per-unit) + freeBand (included). onDemandAmount is the computed monthly
  // overage cost.
  committedRate: z.number().optional(),
  onDemandRate: z.number().optional(),
  rate: z.number().optional(),
  freeBand: z.number().optional(),
  onDemandAmount: z.number()
});

const BillingV2EntitlementSchema = z.object({
  entitled: z.boolean(),
  planTier: z.string().optional(),
  // Product cadence + recurring amount + monthly on-demand overage; dimensions drives the usage bars.
  cadence: z.enum(["monthly", "annual"]).nullable().optional(),
  amount: z.number().optional(),
  onDemandAmount: z.number().optional(),
  dimensions: BillingV2EntitlementDimSchema.array().optional(),
  // Trial state; trialEndsAt is a formatted date string.
  status: z.string().optional(),
  isTrialing: z.boolean().optional(),
  trialEndsAt: z.string().nullable().optional(),
  renewsOn: z.string().nullable().optional(),
  limit: z.number().nullable().optional(),
  used: z.number().optional(),
  unit: z.string().nullable().optional()
});

const BillingV2OverviewSchema = z.object({
  isCloud: z.boolean(),
  mode: z.enum(["self-serve", "managed"]),
  subState: z.enum(["active", "trialing", "past-due", "suspended", "no-subscription"]),
  planName: z.string(),
  billing: z.object({
    monthlyRecurring: z.number(),
    annualCommitted: z.number(),
    activeProductCount: z.number(),
    nextCharge: z
      .object({
        amount: z.number(),
        at: z.string(),
        productKeys: z.string().array(),
        cadence: z.enum(["monthly", "annual"]).nullable(),
        hasUsage: z.boolean()
      })
      .nullable()
  }),
  payment: z.object({ brand: z.string(), last4: z.string(), expMonth: z.number(), expYear: z.number() }).nullable(),
  billingDetails: z
    .object({
      name: z.string(),
      email: z.string(),
      address: z
        .object({
          // Each sub-field is nullish: Stripe/older license servers omit or null any unfilled line.
          line1: z.string().nullish(),
          line2: z.string().nullish(),
          city: z.string().nullish(),
          state: z.string().nullish(),
          postalCode: z.string().nullish(),
          country: z.string().nullish()
        })
        .nullable(),
      taxIds: z.object({ type: z.string(), value: z.string() }).array()
    })
    .nullable(),
  invoices: BillingV2InvoiceSchema.array(),
  entitlements: z.record(BillingV2EntitlementSchema),
  trialedProductKeys: z.string().array(),
  onDemandAmount: z.number()
});

const BillingV2PreviewLineSchema = z.object({
  description: z.string(),
  amount: z.number(),
  proration: z.boolean()
});

const BillingV2PreviewSchema = z.object({
  currency: z.string(),
  prorationAmount: z.number(),
  nextInvoiceTotal: z.number(),
  nextRecurringTotal: z.number(),
  prorationDate: z.number(),
  lines: BillingV2PreviewLineSchema.array()
});

// Subscription mutations mirror the checkout result: the change applies in place and the affected
// subscription id comes back (the DB mirror catches up via webhook, so the UI refetches overview).
const BillingV2MutationResultSchema = z.object({ subscriptionId: z.string().optional() });

// Per-dimension committed quantities (annual per_resource) and a single commitment quantity change.
const BillingV2CommitmentsSchema = z.record(z.string().trim(), z.number().int().min(0));
const BillingV2CommitmentChangeSchema = z.object({
  dimensionKey: z.string().trim(),
  quantity: z.number().int().min(1)
});

export const registerLicenseV2Router = async (server: FastifyZodProvider) => {
  // Every route is gated on LICENSE_SERVER_V2_MODE="on"; the billing surface is invisible until full v2 cutover.
  server.addHook("onRequest", async () => {
    if (!server.services.licenseV2.isEnabled()) {
      throw new NotFoundError({ message: "License Server v2 is not enabled" });
    }
  });

  const buildActor = (permission: FastifyRequest["permission"]) => ({
    type: permission.type,
    id: permission.id,
    authMethod: permission.authMethod,
    orgId: permission.orgId,
    rootOrgId: permission.rootOrgId,
    parentOrgId: permission.parentOrgId
  });

  server.route({
    method: "GET",
    url: "/:organizationId/billing/v2/overview",
    config: {
      rateLimit: readLimit
    },
    schema: {
      params: z.object({ organizationId: z.string().trim() }),
      response: {
        200: z.object({ overview: BillingV2OverviewSchema })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      return server.services.licenseV2.getOverview({
        orgId: req.params.organizationId,
        actor: buildActor(req.permission)
      });
    }
  });

  server.route({
    method: "GET",
    url: "/:organizationId/billing/v2/catalog",
    config: {
      rateLimit: readLimit
    },
    schema: {
      params: z.object({ organizationId: z.string().trim() }),
      response: {
        200: z.object({ products: BillingV2CatalogProductSchema.array() })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      return server.services.licenseV2.getCatalog({
        orgId: req.params.organizationId,
        actor: buildActor(req.permission)
      });
    }
  });

  server.route({
    method: "POST",
    url: "/:organizationId/billing/v2/portal-session",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      params: z.object({ organizationId: z.string().trim() }),
      body: z.object({ returnPath: ReturnPathSchema }),
      response: {
        200: z.object({ url: z.string() })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      return server.services.licenseV2.portalSession({
        orgId: req.params.organizationId,
        actor: buildActor(req.permission),
        returnPath: req.body.returnPath
      });
    }
  });

  server.route({
    method: "POST",
    url: "/:organizationId/billing/v2/checkout-session",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      params: z.object({ organizationId: z.string().trim() }),
      body: z.object({
        productId: z.string().trim(),
        plan: z.string().trim().optional(),
        cadence: z.enum(["monthly", "annual"]).optional(),
        commitments: BillingV2CommitmentsSchema.optional(),
        email: z.string().trim().email().optional(),
        returnPath: ReturnPathSchema
      }),
      response: {
        200: z.object({
          outcome: z.enum(["checkout_created", "subscription_updated"]),
          checkoutUrl: z.string().optional(),
          subscriptionId: z.string().optional()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      return server.services.licenseV2.checkoutSession({
        orgId: req.params.organizationId,
        actor: buildActor(req.permission),
        productId: req.body.productId,
        plan: req.body.plan,
        cadence: req.body.cadence,
        commitments: req.body.commitments,
        email: req.body.email,
        returnPath: req.body.returnPath
      });
    }
  });

  server.route({
    method: "POST",
    url: "/:organizationId/billing/v2/payment-method",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      params: z.object({ organizationId: z.string().trim() }),
      body: z.object({ returnPath: ReturnPathSchema }),
      response: {
        200: z.object({ url: z.string() })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      return server.services.licenseV2.addPaymentMethod({
        orgId: req.params.organizationId,
        actor: buildActor(req.permission),
        returnPath: req.body.returnPath
      });
    }
  });

  server.route({
    method: "POST",
    url: "/:organizationId/billing/v2/subscription/preview",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      params: z.object({ organizationId: z.string().trim() }),
      body: z
        .object({
          addProductId: z.string().trim().optional(),
          plan: z.string().trim().optional(),
          cadence: z.enum(["monthly", "annual"]).optional(),
          commitments: BillingV2CommitmentsSchema.optional(),
          removeProductId: z.string().trim().optional(),
          commitmentChanges: BillingV2CommitmentChangeSchema.array().optional()
        })
        .refine((b) => Boolean(b.addProductId) || Boolean(b.removeProductId) || Boolean(b.commitmentChanges?.length), {
          message: "provide a product to add or remove, or a commitment change"
        }),
      response: {
        200: z.object({ preview: BillingV2PreviewSchema })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      return server.services.licenseV2.previewChange({
        orgId: req.params.organizationId,
        actor: buildActor(req.permission),
        addProductId: req.body.addProductId,
        plan: req.body.plan,
        cadence: req.body.cadence,
        commitments: req.body.commitments,
        removeProductId: req.body.removeProductId,
        commitmentChanges: req.body.commitmentChanges
      });
    }
  });

  server.route({
    method: "POST",
    url: "/:organizationId/billing/v2/subscription/items",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      params: z.object({ organizationId: z.string().trim() }),
      body: z.object({
        productId: z.string().trim(),
        plan: z.string().trim().optional(),
        cadence: z.enum(["monthly", "annual"]).optional(),
        commitments: BillingV2CommitmentsSchema.optional()
      }),
      response: {
        200: BillingV2MutationResultSchema
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      return server.services.licenseV2.addProduct({
        orgId: req.params.organizationId,
        actor: buildActor(req.permission),
        productId: req.body.productId,
        plan: req.body.plan,
        cadence: req.body.cadence,
        commitments: req.body.commitments
      });
    }
  });

  server.route({
    method: "DELETE",
    url: "/:organizationId/billing/v2/subscription/items/:productId",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      params: z.object({ organizationId: z.string().trim(), productId: z.string().trim() }),
      response: {
        200: BillingV2MutationResultSchema
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      return server.services.licenseV2.removeProduct({
        orgId: req.params.organizationId,
        actor: buildActor(req.permission),
        productId: req.params.productId
      });
    }
  });

  server.route({
    method: "POST",
    url: "/:organizationId/billing/v2/subscription/commitments",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      params: z.object({ organizationId: z.string().trim() }),
      body: z.object({
        // One or more per_resource commitment changes; the service applies them per dimension.
        changes: BillingV2CommitmentChangeSchema.array().min(1),
        // Echo the prorationDate from a preview so the billed total matches the confirmation.
        prorationDate: z.number().optional()
      }),
      response: {
        200: BillingV2MutationResultSchema
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      return server.services.licenseV2.changeCommitment({
        orgId: req.params.organizationId,
        actor: buildActor(req.permission),
        changes: req.body.changes,
        prorationDate: req.body.prorationDate
      });
    }
  });

  server.route({
    method: "POST",
    url: "/:organizationId/billing/v2/trial",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      params: z.object({ organizationId: z.string().trim() }),
      body: z.object({
        productId: z.string().trim(),
        plan: z.string().trim()
      }),
      response: {
        200: z.object({
          outcome: z.literal("trial_started"),
          cardSetupUrl: z.string().optional()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      // A trial has no Stripe customer yet, so the server needs an email. Take it from the authenticated
      // user (this route is JWT-only) rather than trusting a client-supplied value.
      const email = req.auth.authMode === AuthMode.JWT ? (req.auth.user.email ?? undefined) : undefined;
      return server.services.licenseV2.startTrial({
        orgId: req.params.organizationId,
        actor: buildActor(req.permission),
        productId: req.body.productId,
        plan: req.body.plan,
        email
      });
    }
  });

  server.route({
    method: "POST",
    url: "/:organizationId/billing/v2/trial/cancel",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      params: z.object({ organizationId: z.string().trim() }),
      body: z.object({
        productId: z.string().trim()
      }),
      response: {
        200: z.object({
          outcome: z.literal("trial_completed")
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      return server.services.licenseV2.cancelTrial({
        orgId: req.params.organizationId,
        actor: buildActor(req.permission),
        productId: req.body.productId
      });
    }
  });

  server.route({
    method: "POST",
    url: "/:organizationId/billing/v2/subscription/cancel",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      params: z.object({ organizationId: z.string().trim() }),
      response: {
        200: BillingV2MutationResultSchema
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      return server.services.licenseV2.cancelSubscription({
        orgId: req.params.organizationId,
        actor: buildActor(req.permission)
      });
    }
  });

  server.route({
    method: "POST",
    url: "/:organizationId/billing/v2/subscription/resume",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      params: z.object({ organizationId: z.string().trim() }),
      response: {
        200: BillingV2MutationResultSchema
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      return server.services.licenseV2.resumeSubscription({
        orgId: req.params.organizationId,
        actor: buildActor(req.permission)
      });
    }
  });
};
