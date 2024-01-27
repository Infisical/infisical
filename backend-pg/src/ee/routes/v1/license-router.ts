import { z } from "zod";

import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

export const registerLicenseRouter = async (server: FastifyZodProvider) => {
  server.route({
    url: "/:organizationId/plans/table",
    method: "GET",
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
        orgId: req.params.organizationId,
        billingCycle: req.query.billingCycle
      });
      return data;
    }
  });

  server.route({
    url: "/:organizationId/plan",
    method: "GET",
    schema: {
      params: z.object({ organizationId: z.string().trim() }),
      response: {
        200: z.object({ plan: z.any() })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const plan = await server.services.license.getOrgPlan({
        actorId: req.permission.id,
        actor: req.permission.type,
        orgId: req.params.organizationId
      });
      return { plan };
    }
  });

  server.route({
    url: "/:organizationId/plans",
    method: "GET",
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
        orgId: req.params.organizationId
      });
      return data;
    }
  });

  server.route({
    url: "/:organizationId/session/trial",
    method: "POST",
    schema: {
      params: z.object({ organizationId: z.string().trim() }),
      body: z.object({ success_url: z.string().trim() }),
      response: {
        200: z.any()
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const data = await server.services.license.startOrgTrail({
        actorId: req.permission.id,
        actor: req.permission.type,
        orgId: req.params.organizationId,
        success_url: req.body.success_url
      });
      return data;
    }
  });

  server.route({
    url: "/:organizationId/plan/billing",
    method: "GET",
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
        orgId: req.params.organizationId
      });
      return data;
    }
  });

  server.route({
    url: "/:organizationId/plan/table",
    method: "GET",
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
        orgId: req.params.organizationId
      });
      return data;
    }
  });

  server.route({
    url: "/:organizationId/billing-details",
    method: "GET",
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
        orgId: req.params.organizationId
      });
      return data;
    }
  });

  server.route({
    url: "/:organizationId/billing-details",
    method: "PATCH",
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
        orgId: req.params.organizationId,
        name: req.body.name,
        email: req.body.email
      });
      return data;
    }
  });

  server.route({
    url: "/:organizationId/billing-details/payment-methods",
    method: "GET",
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
        orgId: req.params.organizationId
      });
      return data;
    }
  });

  server.route({
    url: "/:organizationId/billing-details/payment-methods",
    method: "POST",
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
        orgId: req.params.organizationId,
        success_url: req.body.success_url,
        cancel_url: req.body.cancel_url
      });
      return data;
    }
  });

  server.route({
    url: "/:organizationId/billing-details/payment-methods/:pmtMethodId",
    method: "DELETE",
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
        orgId: req.params.organizationId,
        pmtMethodId: req.params.pmtMethodId
      });
      return data;
    }
  });

  server.route({
    url: "/:organizationId/billing-details/tax-ids",
    method: "GET",
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
        orgId: req.params.organizationId
      });
      return data;
    }
  });

  server.route({
    url: "/:organizationId/billing-details/tax-ids",
    method: "POST",
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
        orgId: req.params.organizationId,
        type: req.body.type,
        value: req.body.value
      });
      return data;
    }
  });

  server.route({
    url: "/:organizationId/billing-details/tax-ids/:taxId",
    method: "DELETE",
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
        orgId: req.params.organizationId,
        taxId: req.params.taxId
      });
      return data;
    }
  });

  server.route({
    url: "/:organizationId/invoices",
    method: "GET",
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
        orgId: req.params.organizationId
      });
      return data;
    }
  });

  server.route({
    url: "/:organizationId/licenses",
    method: "GET",
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
        orgId: req.params.organizationId
      });
      return data;
    }
  });
};
