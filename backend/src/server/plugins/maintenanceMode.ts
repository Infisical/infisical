import fp from "fastify-plugin";

import { getConfig } from "@app/lib/config/env";

export const maintenanceMode = fp(async (fastify) => {
  fastify.addHook("onRequest", async (req) => {
    const serverEnvs = getConfig();
    if (req.url !== "/api/v1/auth/checkAuth" && req.method !== "GET" && serverEnvs.MAINTENANCE_MODE) {
      throw new Error("Infisical is in maintenance mode. Please try again later.");
    }
  });
});
