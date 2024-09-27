import fp from "fastify-plugin";

import { DefaultResponseErrorsSchema } from "../routes/sanitizedSchemas";

export const addErrorsToResponseSchemas = fp(async (server) => {
  server.addHook("onRoute", (routeOptions) => {
    if (routeOptions.schema && routeOptions.schema.response) {
      // eslint-disable-next-line no-param-reassign
      routeOptions.schema.response = {
        ...DefaultResponseErrorsSchema,
        ...routeOptions.schema.response
      };
    } else {
      // eslint-disable-next-line no-param-reassign
      routeOptions.schema = routeOptions.schema || {};
      // eslint-disable-next-line no-param-reassign
      routeOptions.schema.response = { ...DefaultResponseErrorsSchema };
    }
  });
});
