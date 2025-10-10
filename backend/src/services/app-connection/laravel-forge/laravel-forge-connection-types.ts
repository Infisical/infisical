import z from "zod";

import { DiscriminativePick } from "@app/lib/types";

import { AppConnection } from "../app-connection-enums";
import {
  CreateLaravelForgeConnectionSchema,
  LaravelForgeConnectionSchema,
  ValidateLaravelForgeConnectionCredentialsSchema
} from "./laravel-forge-connection-schemas";

export type TLaravelForgeConnection = z.infer<typeof LaravelForgeConnectionSchema>;

export type TLaravelForgeConnectionInput = z.infer<typeof CreateLaravelForgeConnectionSchema> & {
  app: AppConnection.LaravelForge;
};

export type TValidateLaravelForgeConnectionCredentialsSchema = typeof ValidateLaravelForgeConnectionCredentialsSchema;

export type TLaravelForgeConnectionConfig = DiscriminativePick<
  TLaravelForgeConnectionInput,
  "method" | "app" | "credentials"
> & {
  orgSlug: string;
};

export type TLaravelForgeOrganization = {
  id: string;
  name: string;
  slug: string;
};

export type TLaravelForgeServer = {
  id: string;
  name: string;
};

export type TLaravelForgeSite = {
  id: string;
  name: string;
};

export type TRawLaravelForgeOrganization = {
  id: string;
  attributes: {
    name: string;
    slug: string;
  };
};

export type TRawLaravelForgeServer = {
  id: string;
  attributes: {
    name: string;
  };
};

export type TRawLaravelForgeSite = {
  id: string;
  attributes: {
    name: string;
  };
};
