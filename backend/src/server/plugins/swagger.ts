import swagger from "@fastify/swagger";
import swaggerUI from "@fastify/swagger-ui";
import fp from "fastify-plugin";

import { jsonSchemaTransform } from "./fastify-zod";

export const fastifySwagger = fp(async (fastify) => {
  await fastify.register(swagger, {
    transform: jsonSchemaTransform,
    openapi: {
      info: {
        title: "Infisical API",
        description: "List of all available APIs that can be consumed",
        version: "0.0.1"
      },
      servers: [
        {
          url: "https://us.infisical.com",
          description: "Production server (US)"
        },
        {
          url: "https://eu.infisical.com",
          description: "Production server (EU)"
        },
        {
          url: "http://localhost:8080",
          description: "Local server"
        }
      ],
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
