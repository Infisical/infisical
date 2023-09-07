import { z } from "zod";

export const CreateRoleSchema = z.object({
  body: z.object({
    slug: z.string().trim(),
    name: z.string().trim(),
    description: z.string().trim().optional(),
    workspaceId: z.string().trim().optional(),
    orgId: z.string().trim(),
    permissions: z
      .object({
        subject: z.string().trim(),
        action: z.string().trim(),
        conditions: z
          .record(z.union([z.string().trim(), z.number(), z.object({ $glob: z.string() })]))
          .optional()
      })
      .array()
  })
});

export const UpdateRoleSchema = z.object({
  params: z.object({
    id: z.string().trim()
  }),
  body: z.object({
    slug: z.string().trim().optional(),
    name: z.string().trim().optional(),
    description: z.string().trim().optional(),
    workspaceId: z.string().trim().optional(),
    orgId: z.string().trim(),
    permissions: z
      .object({
        subject: z.string().trim(),
        action: z.string().trim(),
        conditions: z
          .record(z.union([z.string().trim(), z.number(), z.object({ $glob: z.string() })]))
          .optional()
      })
      .array()
      .optional()
  })
});

export const DeleteRoleSchema = z.object({
  params: z.object({
    id: z.string().trim()
  })
});

export const GetRoleSchema = z.object({
  query: z.object({
    workspaceId: z.string().trim().optional(),
    orgId: z.string().trim()
  })
});

export const GetUserPermission = z.object({
  params: z.object({
    orgId: z.string().trim()
  })
});

export const GetUserProjectPermission = z.object({
  params: z.object({
    workspaceId: z.string().trim()
  })
});
