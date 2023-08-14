import { z } from "zod";

export const CreateRoleSchema = z.object({
  body: z.object({
    slug: z.string(),
    name: z.string(),
    description: z.string().optional(),
    workspaceId: z.string().optional(),
    orgId: z.string(),
    permissions: z
      .object({
        subject: z.string(),
        action: z.string(),
        condition: z.record(z.union([z.string(), z.number()]))
      })
      .array()
  })
});

export const UpdateRoleSchema = z.object({
  params: z.object({
    id: z.string()
  }),
  body: z.object({
    slug: z.string().optional(),
    name: z.string().optional(),
    description: z.string().optional(),
    workspaceId: z.string().optional(),
    orgId: z.string(),
    permissions: z
      .object({
        subject: z.string(),
        action: z.string(),
        condition: z.record(z.union([z.string(), z.number()]))
      })
      .array()
      .optional()
  })
});

export const DeleteRoleSchema = z.object({
  params: z.object({
    id: z.string()
  })
});

export const GetRoleSchema = z.object({
  query: z.object({
    workspaceId: z.string().optional(),
    orgId: z.string()
  })
});
