/* eslint-disable no-param-reassign */
import fp from "fastify-plugin";

import { DefaultResponseErrorsSchema } from "../routes/sanitizedSchemas";

export const addErrorsToResponseSchemas = fp(async (server) => {
  server.addHook("onRoute", (routeOptions) => {
    if (routeOptions.schema && routeOptions.schema.response) {
      routeOptions.schema.response = {
        ...DefaultResponseErrorsSchema,
        ...routeOptions.schema.response
      };
    }
  });
});
