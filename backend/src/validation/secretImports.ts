import { z } from "zod";

export const CreateSecretImportV1 = z.object({
  body: z.object({
    workspaceId: z.string().trim(),
    environment: z.string().trim(),
    folderId: z.string().trim().default("root"),
    secretImport: z.object({
      environment: z.string().trim(),
      secretPath: z.string().trim()
    })
  })
});

export const UpdateSecretImportV1 = z.object({
  params: z.object({
    id: z.string().trim()
  }),
  body: z.object({
    secretImports: z
      .object({
        environment: z.string().trim(),
        secretPath: z.string().trim()
      })
      .array()
  })
});

export const DeleteSecretImportV1 = z.object({
  params: z.object({
    id: z.string().trim()
  }),
  body: z.object({
    secretImportPath: z.string().trim(),
    secretImportEnv: z.string().trim()
  })
});

export const GetSecretImportsV1 = z.object({
  query: z.object({
    workspaceId: z.string().trim(),
    environment: z.string().trim(),
    folderId: z.string().trim()
  })
});

export const GetAllSecretsFromImportV1 = z.object({
  query: z.object({
    workspaceId: z.string().trim(),
    environment: z.string().trim(),
    folderId: z.string().trim().default("root")
  })
});
