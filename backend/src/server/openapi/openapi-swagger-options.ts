import { fullJsonSchemaTransform, jsonSchemaTransform } from "../plugins/fastify-zod";

export const openApiSwaggerOptions = ({ full }: { full: boolean }) => ({
  transform: full ? fullJsonSchemaTransform : jsonSchemaTransform,
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
          type: "http" as const,
          scheme: "bearer",
          bearerFormat: "JWT",
          description: "An access token in Infisical"
        }
      }
    }
  }
});
