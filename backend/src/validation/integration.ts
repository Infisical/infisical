import { z } from "zod";

export const CreateIntegrationV1 = z.object({
  body: z.object({
    integrationAuthId: z.string().trim(),
    app: z.string().trim().optional(),
    isActive: z.boolean(),
    appId: z.string().trim().optional(),
    secretPath: z.string().trim().default("/"),
    sourceEnvironment: z.string().trim(),
    targetEnvironment: z.string().trim().optional(),
    targetEnvironmentId: z.string().trim().optional(),
    targetService: z.string().trim().optional(),
    targetServiceId: z.string().trim().optional(),
    owner: z.string().trim().optional(),
    path: z.string().trim().optional(),
    region: z.string().trim().optional(),
    scope: z.string().trim().optional(),
    metadata: z.object({
      secretPrefix: z.string().optional(),
      secretSuffix: z.string().optional(),
      secretGCPLabel: z.object({
        labelName: z.string(),
        labelValue: z.string()
      }).optional(),
    }).optional()
  })
});

export const UpdateIntegrationV1 = z.object({
  params: z.object({
    integrationId: z.string().trim()
  }),
  body: z.object({
    app: z.string().trim(),
    appId: z.string().trim(),
    isActive: z.boolean(),
    secretPath: z.string().trim().default("/"),
    targetEnvironment: z.string().trim(),
    owner: z.string().trim(),
    environment: z.string().trim()
  })
});

export const DeleteIntegrationV1 = z.object({
  params: z.object({
    integrationId: z.string().trim()
  })
});

export const ManualSyncV1 = z.object({
  body: z.object({
    environment: z.string().trim(),
    workspaceId: z.string().trim()
  })
});
