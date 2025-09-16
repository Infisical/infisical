import { z } from "zod";

import { PkiSync } from "./pki-sync-enums";

// Base PKI sync schema for API responses
export const PkiSyncSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable().optional(),
  destination: z.nativeEnum(PkiSync),
  isAutoSyncEnabled: z.boolean(),
  destinationConfig: z.record(z.unknown()),
  syncOptions: z.record(z.unknown()),
  projectId: z.string(),
  subscriberId: z.string().nullable().optional(),
  connectionId: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
  syncStatus: z.string().nullable().optional(),
  lastSyncedAt: z.date().nullable().optional()
});

// Schema for PKI sync list items (includes app connection info)
export const PkiSyncListItemSchema = PkiSyncSchema.extend({
  appConnectionName: z.string(),
  appConnectionApp: z.string()
});

// Schema for PKI sync details (includes app connection info)
export const PkiSyncDetailsSchema = PkiSyncSchema.extend({
  appConnectionName: z.string(),
  appConnectionApp: z.string()
});

export type TPkiSyncSchema = z.infer<typeof PkiSyncSchema>;
export type TPkiSyncListItemSchema = z.infer<typeof PkiSyncListItemSchema>;
export type TPkiSyncDetailsSchema = z.infer<typeof PkiSyncDetailsSchema>;
