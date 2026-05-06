import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  CreateVenafiTppConnectionSchema,
  SanitizedVenafiTppConnectionSchema,
  UpdateVenafiTppConnectionSchema
} from "@app/services/app-connection/venafi-tpp";

import { registerAppConnectionEndpoints } from "./app-connection-endpoints";

export const registerVenafiTppConnectionRouter = async (server: FastifyZodProvider) => {
  registerAppConnectionEndpoints({
    app: AppConnection.VenafiTpp,
    server,
    sanitizedResponseSchema: SanitizedVenafiTppConnectionSchema,
    createSchema: CreateVenafiTppConnectionSchema,
    updateSchema: UpdateVenafiTppConnectionSchema
  });
};
