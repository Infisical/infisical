import cookie from "@fastify/cookie";
import swagger from "@fastify/swagger";
import fastify from "fastify";

import { serializerCompiler, validatorCompiler, ZodTypeProvider } from "../plugins/fastify-zod";
import { registerResponseSchemaHooks } from "../plugins/response-schema-hooks";
import { registerApiRoutes, registerWebhookRoutes } from "../routes/register-api-routes";
import { TOpenApiDocument } from "./build-openapi-artifacts";
import { openApiSwaggerOptions } from "./openapi-swagger-options";

const PLACEHOLDER_COOKIE_SECRET = "openapi-generator-placeholder-cookie-secret-0000000000000000000";

// Only the generator calls this, in its own process. A running server must not: some routers keep
// state at module level (eg the passport strategies in sso-router.ts close over the server that
// registered them), and a second registration would rebind it to this stub server.
export const buildOpenApiSpec = async (): Promise<TOpenApiDocument> => {
  const server = fastify({ logger: false, ignoreTrailingSlash: true }).withTypeProvider<ZodTypeProvider>();
  server.setValidatorCompiler(validatorCompiler);
  server.setSerializerCompiler(serializerCompiler);

  // Routers only reach these from handlers, which never run here.
  server.decorate("services", {} as FastifyZodProvider["services"]);
  server.decorate("store", {} as FastifyZodProvider["store"]);
  // @ts-expect-error the redis decoration type (Redis | Cluster) does not type check when set to an empty object
  server.decorate("redis", {} as FastifyZodProvider["redis"]);
  server.decorate("cookieSigningKey", PLACEHOLDER_COOKIE_SECRET);
  // The SSO routers register @fastify/session, which requires it.
  await server.register(cookie, { secret: PLACEHOLDER_COOKIE_SECRET });

  await server.register(registerResponseSchemaHooks);
  await server.register(swagger, openApiSwaggerOptions({ full: false }));

  await registerWebhookRoutes(server as unknown as FastifyZodProvider);
  await registerApiRoutes(server as unknown as FastifyZodProvider);
  await server.ready();

  const spec = server.swagger() as unknown as TOpenApiDocument;
  await server.close();
  return spec;
};
