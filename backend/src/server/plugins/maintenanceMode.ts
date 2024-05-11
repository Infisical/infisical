import fp from "fastify-plugin";

import { getConfig } from "@app/lib/config/env";

export const maintenanceMode = fp(async (fastify) => {
  fastify.addHook("onRequest", async (req) => {
    const serverEnvs = getConfig();
    if (serverEnvs.MAINTENANCE_MODE) {
      // skip if its universal auth login or renew
      if (req.url === "/api/v1/auth/universal-auth/login" && req.method === "POST") return;
      if (req.url === "/api/v1/auth/token/renew" && req.method === "POST") return;
      if (req.url !== "/api/v1/auth/checkAuth" && req.method !== "GET") {
        throw new Error("Infisical is in maintenance mode. Please try again later.");
      }
    }
  });
});
