import swagger from "@fastify/swagger";
import swaggerUI from "@fastify/swagger-ui";
import fp from "fastify-plugin";

import { getConfig } from "@app/lib/config/env";

import { jsonSchemaTransform } from "./fastify-zod";

export const fastifySwagger = fp(async (fastify) => {
  const appCfg = getConfig();

  const servers: { url: string; description: string }[] = [];

  // When SITE_URL is set, prioritise it so self-hosted Swagger UI points at
  // the correct host instead of hardcoded Infisical Cloud URLs.
  if (appCfg.SITE_URL) {
    servers.push({ url: appCfg.SITE_URL, description: "Current server" });
  }

  servers.push(
    { url: "https://us.infisical.com", description: "Production server (US)" },
    { url: "https://eu.infisical.com", description: "Production server (EU)" },
    { url: `http://localhost:${appCfg.PORT || 8080}`, description: "Local server" }
  );

  await fastify.register(swagger, {
    transform: jsonSchemaTransform,
    openapi: {
      info: {
        title: "Infisical API",
        description: "List of all available APIs that can be consumed",
        version: "0.0.1"
      },
      servers,
      components: {
        securitySchemes: {
          bearerAuth: {
            type: "http",
            scheme: "bearer",
            bearerFormat: "JWT",
            description: "An access token in Infisical"
          }
        }
      }
    }
  });

  await fastify.register(swaggerUI, {
    routePrefix: "/api/docs",
    prefix: "/api/docs"
  });
});
