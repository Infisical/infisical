import { z } from "zod";

import { ObservabilityWidgetViewsSchema } from "@app/db/schemas";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

const ObservabilityWidgetViewResponseSchema = ObservabilityWidgetViewsSchema.pick({
  id: true,
  name: true,
  orgId: true,
  userId: true,
  createdAt: true,
  updatedAt: true
}).extend({
  items: z.unknown()
});

export const registerObservabilityWidgetViewRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "POST",
    url: "/",
    config: {
      rateLimit: writeLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      operationId: "createObservabilityWidgetView",
      body: z.object({
        name: z.string().min(1).max(128),
        orgId: z.string().uuid()
      }),
      response: {
        201: z.object({
          view: ObservabilityWidgetViewResponseSchema
        })
      }
    },
    handler: async (req, res) => {
      const view = await server.services.observabilityWidgetView.createView({
        name: req.body.name,
        orgId: req.body.orgId,
        userId: req.permission.id
      });
      return res.status(201).send({ view });
    }
  });

  server.route({
    method: "GET",
    url: "/",
    config: {
      rateLimit: readLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      operationId: "listObservabilityWidgetViews",
      querystring: z.object({
        orgId: z.string().uuid()
      }),
      response: {
        200: z.object({
          views: z.array(ObservabilityWidgetViewResponseSchema)
        })
      }
    },
    handler: async (req) => {
      const views = await server.services.observabilityWidgetView.listViews(req.query.orgId, req.permission.id);
      return { views };
    }
  });

  server.route({
    method: "GET",
    url: "/:viewId",
    config: {
      rateLimit: readLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      operationId: "getObservabilityWidgetView",
      params: z.object({
        viewId: z.string().uuid()
      }),
      response: {
        200: z.object({
          view: ObservabilityWidgetViewResponseSchema
        })
      }
    },
    handler: async (req) => {
      const view = await server.services.observabilityWidgetView.getView(req.params.viewId);
      return { view };
    }
  });

  server.route({
    method: "PATCH",
    url: "/:viewId",
    config: {
      rateLimit: writeLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      operationId: "updateObservabilityWidgetView",
      params: z.object({
        viewId: z.string().uuid()
      }),
      body: z.object({
        orgId: z.string().uuid(),
        name: z.string().min(1).max(128).optional(),
        items: z.array(z.unknown()).optional()
      }),
      response: {
        200: z.object({
          view: ObservabilityWidgetViewResponseSchema
        })
      }
    },
    handler: async (req) => {
      const view = await server.services.observabilityWidgetView.updateView(req.params.viewId, {
        name: req.body.name,
        items: req.body.items
      });
      return { view };
    }
  });

  server.route({
    method: "DELETE",
    url: "/:viewId",
    config: {
      rateLimit: writeLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      operationId: "deleteObservabilityWidgetView",
      params: z.object({
        viewId: z.string().uuid()
      }),
      querystring: z.object({
        orgId: z.string().uuid()
      }),
      response: {
        200: z.object({
          view: ObservabilityWidgetViewResponseSchema
        })
      }
    },
    handler: async (req) => {
      const view = await server.services.observabilityWidgetView.deleteView(req.params.viewId);
      return { view };
    }
  });
};
