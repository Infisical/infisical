import swagger from "@fastify/swagger";
import swaggerUI from "@fastify/swagger-ui";
import fp from "fastify-plugin";

import { jsonSchemaTransform } from "./fastify-zod";

// TODO(akhilmhdh-pg): change the localhost port later
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
          url: "http://localhost:4000",
          description: "Local server"
        },
        {
          url: "https://app.infisical.com",
          description: "Production server"
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
