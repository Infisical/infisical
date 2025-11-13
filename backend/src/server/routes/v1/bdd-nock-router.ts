import { z } from "zod";

import { getConfig } from "@app/lib/config/env";
import { ForbiddenRequestError } from "@app/lib/errors";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";
import nock, { Definition } from "nock";

export const registerBddNockRouter = async (server: FastifyZodProvider) => {
  const checkIfBddNockApiEnabled = () => {
    const appCfg = getConfig();
    // Note: Please note that this API is only available in development mode and only for BDD tests.
    // This endpoint should NEVER BE ENABLED IN PRODUCTION!
    if (appCfg.NODE_ENV !== "development" || !appCfg.isBddNockApiEnabled) {
      throw new ForbiddenRequestError({ message: "BDD Nock API is not enabled" });
    }
  };

  server.route({
    method: "POST",
    url: "/define",
    schema: {
      body: z.object({ definition: z.string() }),
      response: {
        200: z.object({ status: z.string() })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      checkIfBddNockApiEnabled();
      const { body } = req;
      const { definition } = body;
      nock.define(definition as unknown as Definition[]);
      return { status: "ok" };
    }
  });

  server.route({
    method: "POST",
    url: "/restore",
    schema: {
      response: {
        200: z.object({ status: z.string() })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      checkIfBddNockApiEnabled();
      nock.restore();
      return { status: "ok" };
    }
  });

  server.route({
    method: "POST",
    url: "/clear-all",
    schema: {
      response: {
        200: z.object({ status: z.string() })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      checkIfBddNockApiEnabled();
      nock.cleanAll();
      return { status: "ok" };
    }
  });
};
