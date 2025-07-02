import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  CreateBitBucketConnectionSchema,
  SanitizedBitBucketConnectionSchema,
  UpdateBitBucketConnectionSchema
} from "@app/services/app-connection/bitbucket";

import { registerAppConnectionEndpoints } from "./app-connection-endpoints";

export const registerBitBucketConnectionRouter = async (server: FastifyZodProvider) => {
  registerAppConnectionEndpoints({
    app: AppConnection.BitBucket,
    server,
    sanitizedResponseSchema: SanitizedBitBucketConnectionSchema,
    createSchema: CreateBitBucketConnectionSchema,
    updateSchema: UpdateBitBucketConnectionSchema
  });
};
