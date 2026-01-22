import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  CreateCircleCIConnectionSchema,
  SanitizedCircleCIConnectionSchema,
  UpdateCircleCIConnectionSchema
} from "@app/services/app-connection/circleci";

import { registerAppConnectionEndpoints } from "./app-connection-endpoints";

export const registerCircleCIConnectionRouter = async (server: FastifyZodProvider) => {
  registerAppConnectionEndpoints({
    app: AppConnection.CircleCI,
    server,
    sanitizedResponseSchema: SanitizedCircleCIConnectionSchema,
    createSchema: CreateCircleCIConnectionSchema,
    updateSchema: UpdateCircleCIConnectionSchema
  });
};
