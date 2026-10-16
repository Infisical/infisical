import { registerBddNockRouter } from "@bdd_routes/bdd-nock-router";

import { registerCertificateEstRouter } from "@app/ee/routes/est/certificate-est-router";
import { registerPkiScepRouter } from "@app/ee/routes/scep/pki-scep-router";
import { registerV1EERoutes } from "@app/ee/routes/v1";
import { registerV2EERoutes } from "@app/ee/routes/v2";
import { registerV3EERoutes } from "@app/ee/routes/v3";
import { getConfig } from "@app/lib/config/env";
import { registerSecretScanningV2Webhooks } from "@app/server/plugins/secret-scanner-v2";

import { registerStatusRoute } from "./status-router";
import { registerV1Routes } from "./v1";
import { registerV2Routes } from "./v2";
import { registerV3Routes } from "./v3";
import { registerV4Routes } from "./v4";

// The OpenAPI generator (server/openapi) registers these same functions on a bare server with stub
// services, so a route registered anywhere else is missing from the spec, and registering a route
// must not touch services, the database or Redis.

export const registerWebhookRoutes = async (server: FastifyZodProvider) => {
  if (!getConfig().isApiRunModeEnabled) return;

  await server.register(registerSecretScanningV2Webhooks, {
    prefix: "/secret-scanning/webhooks"
  });
};

export const registerApiRoutes = async (server: FastifyZodProvider) => {
  registerStatusRoute(server);

  // A worker-only pod still serves /api/status so liveness and readiness probes keep working, but
  // none of the product API.
  if (!getConfig().isApiRunModeEnabled) return;

  await server.register(registerCertificateEstRouter, { prefix: "/.well-known/est" });
  await server.register(registerPkiScepRouter, { prefix: "/scep" });

  await server.register(
    async (v1Server) => {
      await v1Server.register(registerV1EERoutes);
      await v1Server.register(registerV1Routes);
    },
    { prefix: "/api/v1" }
  );
  await server.register(
    async (v2Server) => {
      await v2Server.register(registerV2EERoutes);
      await v2Server.register(registerV2Routes);
    },
    { prefix: "/api/v2" }
  );
  await server.register(
    async (v3Server) => {
      await v3Server.register(registerV3EERoutes);
      await v3Server.register(registerV3Routes);
    },
    { prefix: "/api/v3" }
  );
  await server.register(registerV4Routes, { prefix: "/api/v4" });

  // Note: This is a special route for BDD tests. It's only available in development mode and only for BDD tests.
  // This route should NEVER BE ENABLED IN PRODUCTION!
  if (getConfig().isBddNockApiEnabled) {
    await server.register(registerBddNockRouter, { prefix: "/api/__bdd_nock__" });
  }
};
