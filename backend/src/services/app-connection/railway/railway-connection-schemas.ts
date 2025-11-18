import z from "zod";

import { AppConnections } from "@app/lib/api-docs";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  BaseAppConnectionSchema,
  GenericCreateAppConnectionFieldsSchema,
  GenericUpdateAppConnectionFieldsSchema
} from "@app/services/app-connection/app-connection-schemas";

import { APP_CONNECTION_NAME_MAP } from "../app-connection-maps";
import { RailwayConnectionMethod } from "./railway-connection-constants";

export const RailwayConnectionMethodSchema = z
  .nativeEnum(RailwayConnectionMethod)
  .describe(AppConnections.CREATE(AppConnection.Railway).method);

export const RailwayConnectionAccessTokenCredentialsSchema = z.object({
  apiToken: z
    .string()
    .trim()
    .min(1, "API Token required")
    .max(255)
    .describe(AppConnections.CREDENTIALS.RAILWAY.apiToken)
});

const BaseRailwayConnectionSchema = BaseAppConnectionSchema.extend({
  app: z.literal(AppConnection.Railway)
});

export const RailwayConnectionSchema = BaseRailwayConnectionSchema.extend({
  method: RailwayConnectionMethodSchema,
  credentials: RailwayConnectionAccessTokenCredentialsSchema
});

export const SanitizedRailwayConnectionSchema = z.discriminatedUnion("method", [
  BaseRailwayConnectionSchema.extend({
    method: RailwayConnectionMethodSchema,
    credentials: RailwayConnectionAccessTokenCredentialsSchema.pick({})
  }).describe(JSON.stringify({ title: `${APP_CONNECTION_NAME_MAP[AppConnection.Railway]} (Access Token)` }))
]);

export const ValidateRailwayConnectionCredentialsSchema = z.discriminatedUnion("method", [
  z.object({
    method: RailwayConnectionMethodSchema,
    credentials: RailwayConnectionAccessTokenCredentialsSchema.describe(
      AppConnections.CREATE(AppConnection.Railway).credentials
    )
  })
]);

export const CreateRailwayConnectionSchema = ValidateRailwayConnectionCredentialsSchema.and(
  GenericCreateAppConnectionFieldsSchema(AppConnection.Railway)
);

export const UpdateRailwayConnectionSchema = z
  .object({
    credentials: RailwayConnectionAccessTokenCredentialsSchema.optional().describe(
      AppConnections.UPDATE(AppConnection.Railway).credentials
    )
  })
  .and(GenericUpdateAppConnectionFieldsSchema(AppConnection.Railway));

export const RailwayConnectionListItemSchema = z
  .object({
    name: z.literal("Railway"),
    app: z.literal(AppConnection.Railway),
    methods: z.nativeEnum(RailwayConnectionMethod).array()
  })
  .describe(JSON.stringify({ title: APP_CONNECTION_NAME_MAP[AppConnection.Railway] }));

export const RailwayResourceSchema = z.object({
  node: z.object({
    id: z.string(),
    name: z.string()
  })
});

export const RailwayProjectEdgeSchema = z.object({
  node: z.object({
    id: z.string(),
    name: z.string(),
    services: z.object({
      edges: z.array(RailwayResourceSchema)
    }),
    environments: z.object({
      edges: z.array(RailwayResourceSchema)
    })
  })
});

export const RailwayProjectsListSchema = z.object({
  projects: z.object({
    edges: z.array(RailwayProjectEdgeSchema)
  })
});

export const RailwayAccountWorkspaceListSchema = z.object({
  me: z.object({
    workspaces: z.array(
      z.object({
        id: z.string(),
        name: z.string(),
        team: RailwayProjectsListSchema
      })
    )
  })
});

export const RailwayGetProjectsByProjectTokenSchema = z.object({
  projectToken: z.object({
    project: RailwayProjectEdgeSchema.shape.node
  })
});

export const RailwayGetSubscriptionTypeSchema = z.object({
  project: z.object({
    subscriptionType: z.enum(["free", "hobby", "pro", "trial"])
  })
});
