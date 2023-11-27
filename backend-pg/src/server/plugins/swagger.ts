import fp from "fastify-plugin";
import swagger from "@fastify/swagger";
import swaggerUI from "@fastify/swagger-ui";

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
          url: "https://app.infisical.com",
          description: "Production server"
        },
        {
          url: "http://localhost:8000",
          description: "Local server"
        }
      ],
      components: {
        securitySchemes: {
          bearer: {
            type: "http",
            scheme: "bearer",
            bearerFormat: "JWT",
            description: "A service token in Infisical"
          },
          apiKey: {
            type: "apiKey",
            in: "header",
            name: "X-API-Key",
            description: "An API Key in Infisical"
          }
        }
      }
    }
  });

  await fastify.register(swaggerUI, {
    routePrefix: "/docs"
  });
});
