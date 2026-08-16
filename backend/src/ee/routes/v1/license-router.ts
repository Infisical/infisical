/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
// TODO(akhilmhdh): Fix this when license service gets it type
import { z } from "zod";

import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

export const registerLicenseRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "GET",
    url: "/:organizationId/plans/table",
    config: {
      rateLimit: readLimit
    },
    schema: {
      querystring: z.object({ billingCycle: z.enum(["monthly", "yearly"]) }),
      params: z.object({ organizationId: z.string().trim() }),
      response: {
        200: z.any()
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const data = await server.services.license.getOrgPlansTableByBillCycle({
        actorId: req.permission.id,
        actor: req.permission.type,
        actorOrgId: req.permission.orgId,
        orgId: req.params.organizationId,
        actorAuthMethod: req.permission.authMethod,
        billingCycle: req.query.billingCycle
      });
      return data;
    }
  });

  server.route({
    method: "GET",
    url: "/:organizationId/plan",
    config: {
      rateLimit: readLimit
    },
    schema: {
      params: z.object({ organizationId: z.string().trim() }),
      querystring: z.object({
        refreshCache: z
          .enum(["true", "false"])
          .default("false")
          .transform((value) => value === "true")
      }),
      response: {
        200: z.object({ plan: z.any() })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const plan = await server.services.license.getOrgPlan({
        actorId: req.permission.id,
        actor: req.permission.type,
        actorOrgId: req.permission.orgId,
        rootOrgId: req.permission.rootOrgId,
        actorAuthMethod: req.permission.authMethod,
        orgId: req.params.organizationId,
        refreshCache: req.query.refreshCache
      });
      return { plan };
    }
  });

  server.route({
    method: "GET",
    url: "/:organizationId/plans",
    config: {
      rateLimit: readLimit
    },
    schema: {
      params: z.object({ organizationId: z.string().trim() }),
      querystring: z.object({ workspaceId: z.string().trim().optional() }),
      response: {
        200: z.any()
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const data = await server.services.license.getOrgPlan({
        actorId: req.permission.id,
        actor: req.permission.type,
        actorOrgId: req.permission.orgId,
        actorAuthMethod: req.permission.authMethod,
        orgId: req.params.organizationId,
        rootOrgId: req.permission.rootOrgId
      });
      return data;
    }
  });

  server.route({
    method: "POST",
    url: "/:organizationId/session/trial",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      params: z.object({ organizationId: z.string().trim() }),
      body: z.object({ success_url: z.string().trim() }),
      response: {
        200: z.any()
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const data = await server.services.license.startOrgTrial({
        actorId: req.permission.id,
        actor: req.permission.type,
        actorOrgId: req.permission.orgId,
        orgId: req.params.organizationId,
        actorAuthMethod: req.permission.authMethod,
        success_url: req.body.success_url
      });
      return data;
    }
  });

  server.route({
    url: "/:organizationId/customer-portal-session",
    method: "POST",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      params: z.object({ organizationId: z.string().trim() }),
      response: {
        200: z.any()
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const data = await server.services.license.createOrganizationPortalSession({
        actorId: req.permission.id,
        actor: req.permission.type,
        actorOrgId: req.permission.orgId,
        actorAuthMethod: req.permission.authMethod,
        orgId: req.params.organizationId
      });
      return data;
    }
  });

  server.route({
    method: "GET",
    url: "/:organizationId/plan/billing",
    config: {
      rateLimit: readLimit
    },
    schema: {
      params: z.object({ organizationId: z.string().trim() }),
      response: {
        200: z.any()
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const data = await server.services.license.getOrgBillingInfo({
        actorId: req.permission.id,
        actor: req.permission.type,
        actorOrgId: req.permission.orgId,
        actorAuthMethod: req.permission.authMethod,
        orgId: req.params.organizationId
      });
      return data;
    }
  });

  server.route({
    method: "GET",
    url: "/:organizationId/plan/table",
    config: {
      rateLimit: readLimit
    },
    schema: {
      params: z.object({ organizationId: z.string().trim() }),
      response: {
        200: z.any()
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const data = await server.services.license.getOrgPlanTable({
        actorId: req.permission.id,
        actor: req.permission.type,
        actorOrgId: req.permission.orgId,
        actorAuthMethod: req.permission.authMethod,
        orgId: req.params.organizationId
      });
      return data;
    }
  });

  server.route({
    method: "GET",
    url: "/:organizationId/billing-details",
    config: {
      rateLimit: readLimit
    },
    schema: {
      params: z.object({ organizationId: z.string().trim() }),
      response: {
        200: z.any()
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const data = await server.services.license.getOrgBillingDetails({
        actorId: req.permission.id,
        actor: req.permission.type,
        actorOrgId: req.permission.orgId,
        actorAuthMethod: req.permission.authMethod,
        orgId: req.params.organizationId
      });
      return data;
    }
  });

  server.route({
    method: "PATCH",
    url: "/:organizationId/billing-details",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      params: z.object({ organizationId: z.string().trim() }),
      body: z.object({
        email: z.string().trim().email().optional(),
        name: z.string().trim().optional()
      }),
      response: {
        200: z.any()
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const data = await server.services.license.updateOrgBillingDetails({
        actorId: req.permission.id,
        actor: req.permission.type,
        actorOrgId: req.permission.orgId,
        actorAuthMethod: req.permission.authMethod,
        orgId: req.params.organizationId,
        name: req.body.name,
        email: req.body.email
      });
      return data;
    }
  });

  server.route({
    method: "GET",
    url: "/:organizationId/billing-details/payment-methods",
    config: {
      rateLimit: readLimit
    },
    schema: {
      params: z.object({ organizationId: z.string().trim() }),
      response: {
        200: z.any()
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const data = await server.services.license.getOrgPmtMethods({
        actorId: req.permission.id,
        actor: req.permission.type,
        actorOrgId: req.permission.orgId,
        actorAuthMethod: req.permission.authMethod,
        orgId: req.params.organizationId
      });
      return data;
    }
  });

  server.route({
    method: "POST",
    url: "/:organizationId/billing-details/payment-methods",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      params: z.object({ organizationId: z.string().trim() }),
      body: z.object({
        success_url: z.string().trim(),
        cancel_url: z.string().trim()
      }),
      response: {
        200: z.any()
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const data = await server.services.license.addOrgPmtMethods({
        actorId: req.permission.id,
        actor: req.permission.type,
        actorOrgId: req.permission.orgId,
        actorAuthMethod: req.permission.authMethod,
        orgId: req.params.organizationId,
        success_url: req.body.success_url,
        cancel_url: req.body.cancel_url
      });
      return data;
    }
  });

  server.route({
    method: "DELETE",
    url: "/:organizationId/billing-details/payment-methods/:pmtMethodId",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      params: z.object({
        organizationId: z.string().trim(),
        pmtMethodId: z.string().trim()
      }),
      response: {
        200: z.any()
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const data = await server.services.license.delOrgPmtMethods({
        actorId: req.permission.id,
        actor: req.permission.type,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        orgId: req.params.organizationId,
        pmtMethodId: req.params.pmtMethodId
      });
      return data;
    }
  });

  server.route({
    method: "GET",
    url: "/:organizationId/billing-details/tax-ids",
    config: {
      rateLimit: readLimit
    },
    schema: {
      params: z.object({
        organizationId: z.string().trim()
      }),
      response: {
        200: z.any()
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const data = await server.services.license.getOrgTaxIds({
        actorId: req.permission.id,
        actor: req.permission.type,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        orgId: req.params.organizationId
      });
      return data;
    }
  });

  server.route({
    method: "POST",
    url: "/:organizationId/billing-details/tax-ids",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      params: z.object({
        organizationId: z.string().trim()
      }),
      body: z.object({
        type: z.string().trim(),
        value: z.string().trim()
      }),
      response: {
        200: z.any()
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const data = await server.services.license.addOrgTaxId({
        actorId: req.permission.id,
        actor: req.permission.type,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        orgId: req.params.organizationId,
        type: req.body.type,
        value: req.body.value
      });
      return data;
    }
  });

  server.route({
    method: "DELETE",
    url: "/:organizationId/billing-details/tax-ids/:taxId",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      params: z.object({
        organizationId: z.string().trim(),
        taxId: z.string().trim()
      }),
      response: {
        200: z.any()
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const data = await server.services.license.delOrgTaxId({
        actorId: req.permission.id,
        actor: req.permission.type,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        orgId: req.params.organizationId,
        taxId: req.params.taxId
      });
      return data;
    }
  });

  server.route({
    method: "GET",
    url: "/:organizationId/invoices",
    config: {
      rateLimit: readLimit
    },
    schema: {
      params: z.object({
        organizationId: z.string().trim()
      }),
      response: {
        200: z.any()
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const data = await server.services.license.getOrgTaxInvoices({
        actorId: req.permission.id,
        actor: req.permission.type,
        actorOrgId: req.permission.orgId,
        orgId: req.params.organizationId,
        actorAuthMethod: req.permission.authMethod
      });
      return data;
    }
  });

  server.route({
    method: "GET",
    url: "/:organizationId/licenses",
    config: {
      rateLimit: readLimit
    },
    schema: {
      params: z.object({
        organizationId: z.string().trim()
      }),
      response: {
        200: z.any()
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const data = await server.services.license.getOrgLicenses({
        actorId: req.permission.id,
        actor: req.permission.type,
        actorOrgId: req.permission.orgId,
        actorAuthMethod: req.permission.authMethod,
        orgId: req.params.organizationId
      });
      return data;
    }
  });
};
