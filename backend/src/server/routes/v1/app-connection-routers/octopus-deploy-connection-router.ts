import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  CreateOctopusDeployConnectionSchema,
  SanitizedOctopusDeployConnectionSchema,
  UpdateOctopusDeployConnectionSchema
} from "@app/services/app-connection/octopus-deploy";

import { registerAppConnectionEndpoints } from "./app-connection-endpoints";

export const registerOctopusDeployConnectionRouter = async (server: FastifyZodProvider) => {
  registerAppConnectionEndpoints({
    app: AppConnection.OctopusDeploy,
    server,
    sanitizedResponseSchema: SanitizedOctopusDeployConnectionSchema,
    createSchema: CreateOctopusDeployConnectionSchema,
    updateSchema: UpdateOctopusDeployConnectionSchema
  });
};
