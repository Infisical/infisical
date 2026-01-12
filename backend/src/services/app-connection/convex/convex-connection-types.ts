import z from "zod";

import { DiscriminativePick } from "@app/lib/types";

import { AppConnection } from "../app-connection-enums";
import {
  ConvexConnectionSchema,
  CreateConvexConnectionSchema,
  ValidateConvexConnectionCredentialsSchema
} from "./convex-connection-schemas";

export type TConvexConnection = z.infer<typeof ConvexConnectionSchema>;

export type TConvexConnectionInput = z.infer<typeof CreateConvexConnectionSchema> & {
  app: AppConnection.Convex;
};

export type TValidateConvexConnectionCredentialsSchema = typeof ValidateConvexConnectionCredentialsSchema;

export type TConvexConnectionConfig = DiscriminativePick<TConvexConnection, "method" | "app" | "credentials"> & {
  orgId: string;
};
