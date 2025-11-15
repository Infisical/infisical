import type { Definition } from "nock";
import { z } from "zod";

import { getConfig } from "@app/lib/config/env";
import { ForbiddenRequestError, InternalServerError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

export const registerBddNockRouter = async (server: FastifyZodProvider) => {
  const importNock = () => {
    // Notice: it seems like importing nock somehow increase memory usage a lots, let's import it lazily.
    // eslint-disable-next-line import/no-extraneous-dependencies
    return import("nock");
  };

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
      body: z.object({ definitions: z.unknown().array() }),
      response: {
        200: z.object({ status: z.string() })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      checkIfBddNockApiEnabled();
      const { body } = req;
      const { definitions } = body;
      logger.info(definitions, "Defining nock");
      const processedDefinitions = definitions.map((definition: unknown) => {
        const { path, ...rest } = definition as Definition;
        return {
          ...rest,
          path:
            path !== undefined && typeof path === "string"
              ? path
              : new RegExp((path as unknown as { regex: string }).regex ?? "")
        } as Definition;
      });

      const nock = await importNock();
      nock.define(processedDefinitions);
      // Ensure we are activating the nocks, because we could have called `nock.restore()` before this call.
      if (!nock.isActive()) {
        nock.activate();
      }
      return { status: "ok" };
    }
  });

  server.route({
    method: "POST",
    url: "/clean-all",
    schema: {
      response: {
        200: z.object({ status: z.string() })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async () => {
      checkIfBddNockApiEnabled();
      logger.info("Cleaning all nocks");
      const nock = await importNock();
      nock.cleanAll();
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
    handler: async () => {
      checkIfBddNockApiEnabled();
      logger.info("Restore network requests from nock");
      const nock = await importNock();
      nock.restore();
      return { status: "ok" };
    }
  });
};
