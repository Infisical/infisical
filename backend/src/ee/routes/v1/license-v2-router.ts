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
  pro: z.union([z.string(), z.number(), z.boolean()]),
  ent: z.union([z.string(), z.number(), z.boolean()])
});

const BillingV2CatalogProductSchema = z.object({
  id: z.string(),
  name: z.string(),
  icon: z.string(),
  color: z.string(),
  model: z.enum(["seat", "usage", "limit", "flat"]),
  addon: z.boolean().optional(),
  desc: z.string(),
  tagline: z.string().optional(),
  fromPrice: z.string().optional(),
  pro: z.object({
    base: z.object({ monthly: z.number(), annual: z.number() }).optional(),
    dims: BillingV2DimSchema.array().optional(),
    proFeature: z.string(),
    planKey: z.string().optional()
  }),
  enterprise: z.object({ sales: z.literal(true), feature: z.string() }).nullable(),
  upgradeChanges: z.object({ add: z.string().array() }).optional(),
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

const BillingV2EntitlementSchema = z.object({
  entitled: z.boolean(),
  limit: z.number().nullable().optional(),
  used: z.number().optional(),
  unit: z.string().nullable().optional()
});

const BillingV2OverviewSchema = z.object({
  isCloud: z.boolean(),
  mode: z.enum(["self-serve", "managed"]),
  subState: z.enum(["active", "trialing", "past-due", "suspended", "no-subscription"]),
  planName: z.string(),
  nextBillingDate: z.string().nullable(),
  recurringAmount: z.number().nullable(),
  interval: z.enum(["month", "year"]).nullable(),
  usage: z.object({
    members: z.number(),
    memberLimit: z.number().nullable(),
    identities: z.number(),
    identityLimit: z.number().nullable()
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
  entitlements: z.record(BillingV2EntitlementSchema)
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
        cadence: z.enum(["monthly", "annual"]).optional(),
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
        cadence: req.body.cadence,
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
          cadence: z.enum(["monthly", "annual"]).optional(),
          removeProductId: z.string().trim().optional()
        })
        .refine((b) => Boolean(b.addProductId) || Boolean(b.removeProductId), {
          message: "provide a product to add or remove"
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
        cadence: req.body.cadence,
        removeProductId: req.body.removeProductId
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
        cadence: z.enum(["monthly", "annual"]).optional()
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
        cadence: req.body.cadence
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
