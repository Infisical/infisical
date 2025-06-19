import z from "zod";

import { DiscriminativePick } from "@app/lib/types";

import { AppConnection } from "../app-connection-enums";
import {
  CreateRenderConnectionSchema,
  RenderConnectionSchema,
  ValidateRenderConnectionCredentialsSchema
} from "./render-connection-schema";

export type TRenderConnection = z.infer<typeof RenderConnectionSchema>;

export type TRenderConnectionInput = z.infer<typeof CreateRenderConnectionSchema> & {
  app: AppConnection.Render;
};

export type TValidateRenderConnectionCredentialsSchema = typeof ValidateRenderConnectionCredentialsSchema;

export type TRenderConnectionConfig = DiscriminativePick<TRenderConnectionInput, "method" | "app" | "credentials"> & {
  orgId: string;
};

export type TRenderService = {
  name: string;
  id: string;
};

export type TRawRenderService = {
  cursor: string;
  service: {
    id: string;
    name: string;
  };
};
