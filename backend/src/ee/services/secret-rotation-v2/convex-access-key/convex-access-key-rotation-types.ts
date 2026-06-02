import { z } from "zod";

import { TConvexConnection } from "@app/services/app-connection/convex";

import {
  ConvexAccessKeyRotationGeneratedCredentialsSchema,
  ConvexAccessKeyRotationListItemSchema,
  ConvexAccessKeyRotationSchema,
  CreateConvexAccessKeyRotationSchema
} from "./convex-access-key-rotation-schemas";

export type TConvexAccessKeyRotation = z.infer<typeof ConvexAccessKeyRotationSchema>;

export type TConvexAccessKeyRotationInput = z.infer<typeof CreateConvexAccessKeyRotationSchema>;

export type TConvexAccessKeyRotationListItem = z.infer<typeof ConvexAccessKeyRotationListItemSchema>;

export type TConvexAccessKeyRotationWithConnection = TConvexAccessKeyRotation & {
  connection: TConvexConnection;
};

export type TConvexAccessKeyRotationGeneratedCredentials = z.infer<
  typeof ConvexAccessKeyRotationGeneratedCredentialsSchema
>;
