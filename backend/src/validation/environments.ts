import { z } from "zod";

export const CreateWorkspaceEnvironmentV2 = z.object({
  params: z.object({
    workspaceId: z.string().trim()
  }),
  body: z.object({
    environmentSlug: z.string().trim(),
    environmentName: z.string().trim()
  })
});

export const UpdateWorkspaceEnvironmentV2 = z.object({
  params: z.object({
    workspaceId: z.string().trim()
  }),
  body: z.object({
    environmentSlug: z.string().trim(),
    environmentName: z.string().trim(),
    oldEnvironmentSlug: z.string().trim()
  })
});

export const DeleteWorkspaceEnvironmentV2 = z.object({
  params: z.object({
    workspaceId: z.string().trim()
  }),
  body: z.object({
    environmentSlug: z.string().trim()
  })
});

export const GetAllAccessibileEnvironmentsOfWorkspaceV2 = z.object({
  params: z.object({
    workspaceId: z.string().trim()
  })
});

export const ReorderWorkspaceEnvironmentsV2 = z.object({
  params: z.object({
    workspaceId: z.string().trim()
  }),
  body: z.object({
    environmentSlug: z.string().trim(),
    environmentName: z.string().trim(),
    otherEnvironmentSlug: z.string().trim(),
    otherEnvironmentName: z.string().trim()
  })
});
