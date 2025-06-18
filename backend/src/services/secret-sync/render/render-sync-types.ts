import z from "zod";

import { TRenderConnection } from "@app/services/app-connection/render/render-connection-types";

import { CreateRenderSyncSchema, RenderSyncListItemSchema, RenderSyncSchema } from "./render-sync-schemas";

export type TRenderSyncListItem = z.infer<typeof RenderSyncListItemSchema>;

export type TRenderSync = z.infer<typeof RenderSyncSchema>;

export type TRenderSyncInput = z.infer<typeof CreateRenderSyncSchema>;

export type TRenderSyncWithCredentials = TRenderSync & {
  connection: TRenderConnection;
};

export type TRenderSecret = {
  key: string;
  value: string;
};
