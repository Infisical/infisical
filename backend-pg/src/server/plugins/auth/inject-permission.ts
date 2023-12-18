import fp from "fastify-plugin";

import { ActorType } from "@app/services/auth/auth-type";

// inject permission type needed based on auth extracted
export const injectPermission = fp(async (server) => {
  server.decorateRequest("permission", null);
  server.addHook("onRequest", async (req) => {
    if (!req.auth) return;

    if (req.auth.actor === ActorType.USER) {
      req.permission = { type: ActorType.USER, id: req.auth.userId };
    }
  });
});
