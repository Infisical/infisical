/* eslint-disable no-param-reassign */
import fp from "fastify-plugin";

import { DefaultResponseErrorsSchema } from "../routes/sanitizedSchemas";

const isScimRoutes = (pathname: string) =>
  pathname.startsWith("/api/v1/scim/Users") || pathname.startsWith("/api/v1/scim/Groups");

export const addErrorsToResponseSchemas = fp(async (server) => {
  server.addHook("onRoute", (routeOptions) => {
    if (routeOptions.schema && routeOptions.schema.response && !isScimRoutes(routeOptions.path)) {
      routeOptions.schema.response = {
        ...DefaultResponseErrorsSchema,
        ...routeOptions.schema.response
      };
    }
  });
});
