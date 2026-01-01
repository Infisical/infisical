import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  CreateConvexConnectionSchema,
  SanitizedConvexConnectionSchema,
  UpdateConvexConnectionSchema
} from "@app/services/app-connection/convex";

import { registerAppConnectionEndpoints } from "./app-connection-endpoints";

export const registerConvexConnectionRouter = async (server: FastifyZodProvider) =>
  registerAppConnectionEndpoints({
    app: AppConnection.Convex,
    server,
    sanitizedResponseSchema: SanitizedConvexConnectionSchema,
    createSchema: CreateConvexConnectionSchema,
    updateSchema: UpdateConvexConnectionSchema
  });
